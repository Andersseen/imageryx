import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSelfHostedMigrations } from "../node/migrations";
import { createSqliteDatabaseClient } from "../node/sqlite-database-client";
import type { TestDatabase } from "./create-test-database";

/**
 * Spins up a real, isolated SQLite database (a temp file, not `:memory:` —
 * migrations are applied by `runSelfHostedMigrations`, which opens and
 * closes its own connection, so the schema needs to survive that close
 * before this function reopens it) with every migration applied, wrapped
 * as the same `DatabaseClient` shape `createTestDatabase()` (D1) returns.
 * This is what lets `describeRepositoryContract` (`./repository-contract.ts`)
 * run the identical test suite against both backends.
 */
export async function createSqliteTestDatabase(): Promise<TestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "imageryx-sqlite-test-"));
  const path = join(dir, "test.db");

  await runSelfHostedMigrations(path);
  const client = createSqliteDatabaseClient(path);

  return {
    db: client,
    teardown: async () => {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
