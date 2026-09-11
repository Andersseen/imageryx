import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readMigrationFiles } from "./migration-files";

const MIGRATIONS_TABLE = "_imageryx_migrations";

/**
 * Applying a migration file needs `db.exec()` (node:sqlite's only
 * multi-statement entry point — `.prepare()` accepts exactly one
 * statement, and every migration file in this package legitimately
 * contains several), so this talks to `node:sqlite` directly rather than
 * through `SqliteDatabaseClient` — the request-serving `DatabaseClient`
 * abstraction is deliberately narrower than what migration tooling needs.
 * D1's own migration application (`wrangler d1 migrations apply`) is
 * likewise a separate code path from `D1Database.prepare()`, not
 * something this package reimplements — this mirrors that same split.
 *
 * Bookkeeping lives in a self-managed `_imageryx_migrations` table, not
 * D1's own `d1_migrations` (that table is wrangler-internal and D1-only;
 * this package doesn't and shouldn't reuse its name for a SQLite file it
 * fully owns).
 */
function openRawDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  return db;
}

export interface SelfHostedMigrationStatusEntry {
  name: string;
  applied: boolean;
  appliedAt: string | null;
}

export async function getSelfHostedMigrationStatus(
  path: string,
): Promise<SelfHostedMigrationStatusEntry[]> {
  const db = openRawDatabase(path);
  try {
    const appliedRows = db
      .prepare(`SELECT name, applied_at FROM ${MIGRATIONS_TABLE}`)
      .all() as { name: string; applied_at: string }[];
    const appliedByName = new Map(
      appliedRows.map((row) => [row.name, row.applied_at]),
    );
    return readMigrationFiles().map((file) => ({
      name: file.name,
      applied: appliedByName.has(file.name),
      appliedAt: appliedByName.get(file.name) ?? null,
    }));
  } finally {
    db.close();
  }
}

export interface RunSelfHostedMigrationsResult {
  applied: string[];
}

/** Applies every migration file not yet recorded, in filename order, each inside its own transaction — a clean, empty SQLite file migrates from zero to the current schema; re-running is a no-op once everything is applied. */
export async function runSelfHostedMigrations(
  path: string,
): Promise<RunSelfHostedMigrationsResult> {
  const db = openRawDatabase(path);
  try {
    const appliedRows = db
      .prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`)
      .all() as {
      name: string;
    }[];
    const appliedNames = new Set(appliedRows.map((row) => row.name));

    const applied: string[] = [];
    for (const file of readMigrationFiles()) {
      if (appliedNames.has(file.name)) continue;

      db.exec("BEGIN");
      try {
        db.exec(file.sql);
        db.prepare(
          `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`,
        ).run(file.name, new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      applied.push(file.name);
    }
    return { applied };
  } finally {
    db.close();
  }
}
