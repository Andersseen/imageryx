import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

export interface MigrationFile {
  name: string;
  sql: string;
}

/**
 * Reads every `NNNN_*.sql` migration file in numeric filename order — the
 * same order `wrangler d1 migrations apply` uses. Shared by the D1 test
 * harness (`../testing/create-test-database.ts`, Miniflare-backed) and the
 * SQLite self-host migration runner (`./migrations.ts`) so both ever read
 * migrations exactly one way.
 */
export function readMigrationFiles(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file,
      sql: readFileSync(join(MIGRATIONS_DIR, file), "utf-8"),
    }));
}
