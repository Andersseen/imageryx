import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type {
  DatabaseClient,
  DatabaseExecutionResult,
  DatabaseStatement,
} from "../client";

export interface SqliteDatabaseClient extends DatabaseClient {
  close(): void;
}

/**
 * Every repository already passes only SQL-safe primitives (string,
 * number, `null` — booleans are converted to `0`/`1` before reaching this
 * layer, matching D1's own binding rules) through the shared `unknown[]`
 * params array; this is the single documented cast at the boundary where
 * that generic interface meets `node:sqlite`'s stricter `SQLInputValue`
 * type, the same pattern `R2StorageProvider` uses for its own
 * cross-runtime type friction (see context.md).
 */
function toSqliteParams(params: readonly unknown[]): SQLInputValue[] {
  return params as unknown as SQLInputValue[];
}

/**
 * Node-only SQLite adapter, backed by Node's own built-in `node:sqlite`
 * (`DatabaseSync`) rather than a native-binding package like
 * `better-sqlite3` — zero extra install step, no prebuilt-binary/
 * native-compilation fragility across platforms, and available on this
 * repo's required Node 22 without extra flags. Fully synchronous under the
 * hood (matching the fact that D1 itself is SQLite-backed) — every method
 * here still returns a `Promise` only to satisfy the shared
 * `DatabaseClient` interface, not because any real async I/O happens.
 *
 * Concurrency: a self-hosted deployment is expected to run one Node
 * process against one database file. WAL mode (enabled below, skipped for
 * `:memory:`, where it doesn't apply) allows concurrent readers alongside
 * a writer, but this adapter does no cross-process locking beyond what
 * SQLite's own file locking provides — it is not safe to point two
 * separate Node processes at the same file expecting them to coordinate
 * writes, which is a fine assumption for this phase's single-process
 * self-host proof but should be revisited before any multi-process
 * self-host deployment mode.
 */
export function createSqliteDatabaseClient(path: string): SqliteDatabaseClient {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  return {
    async query<T>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<readonly T[]> {
      return db.prepare(sql).all(...toSqliteParams(params)) as T[];
    },

    async queryOne<T>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<T | null> {
      const row = db.prepare(sql).get(...toSqliteParams(params));
      return (row ?? null) as T | null;
    },

    async execute(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<DatabaseExecutionResult> {
      const result = db.prepare(sql).run(...toSqliteParams(params));
      return { changes: Number(result.changes) };
    },

    async batch(statements: readonly DatabaseStatement[]): Promise<void> {
      if (statements.length === 0) return;
      db.exec("BEGIN");
      try {
        for (const statement of statements) {
          db.prepare(statement.sql).run(
            ...toSqliteParams(statement.params ?? []),
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    close(): void {
      db.close();
    },
  };
}
