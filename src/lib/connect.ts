// Opens the Postgres database: a real server when DATABASE_URL is set (Supabase in
// production), otherwise PGlite, a full Postgres that runs inside Node and keeps its
// files in a local folder, so development and the demo need nothing installed.
// Leaf module (no local imports) so scripts/ can load it directly with Node.
import type { Pool, PoolClient } from "pg";

export type QueryResult<T> = { rows: T[]; rowCount: number };

export type Queryable = {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs several statements at once, without parameters (migrations). */
  exec(sql: string): Promise<void>;
};

export type Database = Queryable & {
  /** Runs `fn` on one connection inside BEGIN … COMMIT (ROLLBACK if it throws). */
  transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

// COUNT(*) is a bigint and SUM() a numeric in Postgres; both are small here, so read them as numbers.
const INT8 = 20;
const NUMERIC = 1700;

export async function openDatabase(opts: { url?: string; dir: string }): Promise<Database> {
  return opts.url ? openServer(opts.url) : openLocal(opts.dir);
}

async function openServer(url: string): Promise<Database> {
  const { default: pg } = await import("pg");
  pg.types.setTypeParser(INT8, Number);
  pg.types.setTypeParser(NUMERIC, Number);
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    // Supabase's pooler signs its certificate with its own CA, so encrypt without verifying it.
    // A URL with ?sslmode=… overrides this.
    ssl: local ? undefined : { rejectUnauthorized: false },
    // Supabase's free plan allows few connections, and hosts may run several instances at once.
    // Vercel starts more (smaller) instances than App Hosting, so each one gets fewer.
    max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 2 : 5)),
    // Give unused connections back quickly: Supabase counts every open one against its limit.
    idleTimeoutMillis: 5_000,
  });
  pool.on("error", (err) => console.error("[orbit] idle database connection failed", err));
  if (process.env.VERCEL) {
    // Vercel pauses idle instances, and a paused instance's timers don't run, so its idle
    // connections would stay open. This closes them before the pause.
    const { attachDatabasePool } = await import("@vercel/functions");
    attachDatabasePool(pool);
  }
  const wrap = (c: Pool | PoolClient): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await c.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
    },
    async exec(sql) {
      await c.query(sql); // no parameters: the simple protocol allows several statements
    },
  });
  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap(client));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openLocal(dir: string): Promise<Database> {
  const fs = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, { parsers: { [INT8]: Number, [NUMERIC]: Number } });
  const wrap = (c: Pick<typeof db, "query" | "exec">): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await c.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(sql) {
      await c.exec(sql);
    },
  });
  return {
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
  };
}
