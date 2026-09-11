#!/usr/bin/env tsx
import { runSelfHostedMigrations } from "../src/node/migrations";
import { resolveSelfHostedDatabasePath } from "./self-hosted-env";

async function main(): Promise<void> {
  const path = resolveSelfHostedDatabasePath();
  const { applied } = await runSelfHostedMigrations(path);

  if (applied.length === 0) {
    console.log(`Self-hosted SQLite database is already up to date (${path}).`);
  } else {
    console.log(`Applied ${applied.length} migration(s) to ${path}:`);
    for (const name of applied) console.log(`  ${name}`);
  }
}

main().catch((error: unknown) => {
  console.error(
    "db:migrate:self-hosted failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
