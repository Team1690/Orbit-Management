import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { openDatabase, type Database, type Queryable } from "./connect";
import { migrate } from "./schema";

// Queries are written with `?` placeholders; they become Postgres' $1, $2, … before they run.

type Param = string | number | null | boolean | undefined;

const g = globalThis as typeof globalThis & {
  __orbitDb?: Promise<Database>;
  __orbitTx?: AsyncLocalStorage<Queryable>;
  __orbitSql?: Map<string, string>;
};

async function open() {
  // The demo (npm run dev:demo) always uses its own local database, even if DATABASE_URL is set.
  const url = process.env.ORBIT_DEMO ? undefined : process.env.DATABASE_URL || undefined;
  const dir = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "pglite");
  const db = await openDatabase({ url, dir });
  await migrate(db);
  return db;
}

// Opened lazily and kept on globalThis so dev hot reloads (and instrumentation) reuse one connection pool.
function database(): Promise<Database> {
  if (!g.__orbitDb) {
    g.__orbitDb = open();
    g.__orbitDb.catch(() => (g.__orbitDb = undefined)); // try again on the next query
  }
  return g.__orbitDb;
}

const txStore = (g.__orbitTx ??= new AsyncLocalStorage<Queryable>());

function toPostgres(sql: string) {
  const cache = (g.__orbitSql ??= new Map<string, string>());
  let out = cache.get(sql);
  if (out === undefined) {
    let n = 0;
    let quote: string | null = null;
    out = "";
    for (const ch of sql) {
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      } else if (ch === "?") {
        out += `$${++n}`;
        continue;
      }
      out += ch;
    }
    cache.set(sql, out);
  }
  return out;
}

function bind(params: Param[]) {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

async function query<T>(sql: string, params: Param[]) {
  const q = txStore.getStore() ?? (await database());
  return q.query<T>(toPostgres(sql), bind(params));
}

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await query<T>(sql, params)).rows;
}

export async function one<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await query<T>(sql, params)).rows[0];
}

/** Runs an INSERT, UPDATE or DELETE. Add `RETURNING id` to an INSERT to get the new row's id. */
export async function run(sql: string, ...params: Param[]) {
  const res = await query<{ id?: number }>(sql, params);
  return { changes: res.rowCount, id: res.rows[0]?.id ?? 0 };
}

/** Transaction-scoped lock id. Holding it makes transactions run one at a time, as they did with SQLite. */
const TX_LOCK = 1690;

/**
 * Runs `fn` in a transaction: every query inside it (also in functions it calls) uses the
 * transaction. Transactions run one at a time, so a check followed by a write can't interleave
 * with another request. A tx() inside another one joins the outer transaction.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const db = await database();
  return db.transaction(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock($1)", [TX_LOCK]);
    return txStore.run(q, fn);
  });
}

export const nowIso = () => new Date().toISOString();
