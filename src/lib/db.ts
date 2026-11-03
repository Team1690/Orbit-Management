import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { migrate } from "./schema";

type Param = SQLInputValue | boolean | undefined;

const g = globalThis as typeof globalThis & {
  __orbitDb?: DatabaseSync;
  __orbitStatements?: Map<string, StatementSync>;
};

function open() {
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "orbit.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

// Opened lazily and kept on globalThis so dev hot reloads reuse one connection.
export function getDb(): DatabaseSync {
  return (g.__orbitDb ??= open());
}

function statement(sql: string) {
  const cache = (g.__orbitStatements ??= new Map<string, StatementSync>());
  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = getDb().prepare(sql);
    cache.set(sql, stmt);
  }
  return stmt;
}

function bind(params: Param[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  return statement(sql)
    .all(...bind(params))
    .map((row) => ({ ...row }) as T);
}

export function one<T>(sql: string, ...params: Param[]): T | undefined {
  const row = statement(sql).get(...bind(params));
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: Param[]) {
  const res = statement(sql).run(...bind(params));
  return { changes: Number(res.changes), id: Number(res.lastInsertRowid) };
}

/** Runs `fn` in a transaction. node:sqlite is synchronous, so nothing interleaves. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
