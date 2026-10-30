import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { logger } from "./log.js";

const log = logger("db");

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 5 });
  pool.on("error", (err) => log.error("idle client error", err));
  return pool;
}

/**
 * Applies db/migrations/*.sql in name order, once each. A file is split on
 * "--;;" lines and each statement runs on its own, because some TimescaleDB
 * statements refuse to run inside a transaction.
 */
export async function migrate(pool: pg.Pool, dir: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Serialise concurrent starts.
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      const statements = sql
        .split(/^--;;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.replace(/--.*$/gm, "").trim() !== "");
      log.info(`applying ${file} (${statements.length} statements)`);
      for (const statement of statements) await client.query(statement);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
}
