import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import type { D1Client } from "../client";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

/** Reads every `NNNN_*.sql` migration file in numeric filename order — the same order `wrangler d1 migrations apply` uses. */
export function readMigrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file,
      sql: readFileSync(join(MIGRATIONS_DIR, file), "utf-8"),
    }));
}

export interface TestDatabase {
  db: D1Client;
  teardown: () => Promise<void>;
}

/**
 * Spins up a real, isolated, in-memory D1 database (via Miniflare) with
 * every migration applied — used by this package's own repository tests
 * and re-exported (through `@imageryx/test-utils/node`) for other
 * packages' tests. Never mocks the SQL layer: every test using this
 * exercises the actual schema, constraints, and indexes.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    d1Databases: { DB: ":memory:" },
  });

  const db = (await mf.getD1Database("DB")) as unknown as D1Client;

  for (const migration of readMigrationFiles()) {
    const statements = splitStatements(migration.sql);
    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }

  return {
    db,
    teardown: () => mf.dispose(),
  };
}

/**
 * D1's `.exec()` would run a whole file as one call, but Miniflare's local
 * D1 binding executes one statement per `.prepare()`, so each migration
 * file is split on semicolons that terminate a statement. This is a
 * simple splitter (adequate for this package's own migrations, which
 * contain no semicolons inside string literals) rather than a general SQL
 * parser. Line comments are stripped first — a comment's prose can itself
 * contain a semicolon (e.g. "deletion; every child row..."), which would
 * otherwise be mistaken for a statement terminator.
 */
function splitStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split("\n")
    .map((line) => (line.trim().startsWith("--") ? "" : line))
    .join("\n");

  return withoutLineComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
