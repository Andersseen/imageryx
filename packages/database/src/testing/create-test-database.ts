import { Miniflare } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import type { DatabaseClient } from "../client";
import { createD1DatabaseClient } from "../d1-database-client";
import { readMigrationFiles } from "../node/migration-files";

export { readMigrationFiles };

export interface TestDatabase {
  db: DatabaseClient;
  teardown: () => Promise<void>;
}

/**
 * Spins up a real, isolated, in-memory D1 database (via Miniflare) with
 * every migration applied, wrapped as a runtime-independent
 * `DatabaseClient` — used by this package's own repository tests and
 * re-exported (through `@imageryx/test-utils/node`) for other packages'
 * tests. Never mocks the SQL layer: every test using this exercises the
 * actual schema, constraints, and indexes. See `../node/sqlite-test-database.ts`
 * for the SQLite equivalent used by the D1/SQLite parity suite.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    d1Databases: { DB: ":memory:" },
  });

  const rawDb = (await mf.getD1Database("DB")) as unknown as D1Database;

  for (const migration of readMigrationFiles()) {
    const statements = splitStatements(migration.sql);
    for (const statement of statements) {
      await rawDb.prepare(statement).run();
    }
  }

  return {
    db: createD1DatabaseClient(rawDb),
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
