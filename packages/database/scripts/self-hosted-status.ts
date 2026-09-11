#!/usr/bin/env tsx
import { getSelfHostedMigrationStatus } from "../src/node/migrations";
import { resolveSelfHostedDatabasePath } from "./self-hosted-env";

async function main(): Promise<void> {
  const path = resolveSelfHostedDatabasePath();
  const status = await getSelfHostedMigrationStatus(path);

  console.log(`Self-hosted SQLite migration status (${path}):`);
  for (const entry of status) {
    console.log(
      `  [${entry.applied ? "x" : " "}] ${entry.name}${entry.appliedAt ? ` (${entry.appliedAt})` : ""}`,
    );
  }

  const pending = status.filter((entry) => !entry.applied).length;
  if (pending > 0) {
    console.log(
      `${pending} migration(s) pending — run \`pnpm db:migrate:self-hosted\`.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "db:status:self-hosted failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
