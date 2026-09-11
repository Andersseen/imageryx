import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import {
  createSqliteDatabaseClient,
  getSelfHostedMigrationStatus,
} from "@imageryx/database/node";
import { createSelfHostedApp } from "./app";
import { parseSelfHostedConfig } from "./config";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

async function main(): Promise<void> {
  const config = parseSelfHostedConfig(process.env, repoRoot);

  // Fails loudly if migrations are missing rather than booting against a schema-less database —
  // run `pnpm db:migrate:self-hosted` first (see README.md's self-host quickstart).
  const status = await getSelfHostedMigrationStatus(config.databasePath);
  const pending = status.filter((entry) => !entry.applied);
  if (pending.length > 0) {
    console.error(
      `Self-hosted database at ${config.databasePath} has ${pending.length} pending migration(s). Run \`pnpm db:migrate:self-hosted\` first.`,
    );
    process.exitCode = 1;
    return;
  }

  const db = createSqliteDatabaseClient(config.databasePath);
  const app = createSelfHostedApp({ db, appEnv: config.appEnv });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `Imageryx self-hosted runtime listening on http://localhost:${info.port} (database: ${config.databasePath})`,
    );
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(
    "Self-hosted runtime failed to start:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
