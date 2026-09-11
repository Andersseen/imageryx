#!/usr/bin/env tsx
/**
 * DESTRUCTIVE: deletes the self-hosted SQLite database file. Refuses to
 * run unless the resolved `DATABASE_PATH` is under `<repoRoot>/.local/` —
 * see `../src/node/reset.ts` for why there is deliberately no override
 * flag. Never runs as part of any other script.
 */
import { resetSelfHostedDatabase } from "../src/node/reset";
import { repoRoot, resolveSelfHostedDatabasePath } from "./self-hosted-env";

async function main(): Promise<void> {
  const path = resolveSelfHostedDatabasePath();
  const { deleted } = resetSelfHostedDatabase(path, repoRoot);
  console.log(
    deleted
      ? `Deleted local self-hosted SQLite state at ${path}.`
      : `No self-hosted SQLite state found at ${path} — nothing to reset.`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "db:reset:self-hosted failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
