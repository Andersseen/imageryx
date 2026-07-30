import { fileURLToPath } from "node:url";
import {
  cloudflarePool,
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrationsPath = fileURLToPath(
  new URL("../../packages/database/migrations", import.meta.url),
);

export default defineConfig(async () => {
  // Test D1 storage is isolated/ephemeral per run — unrelated to `.wrangler/state` used by
  // `wrangler dev` and the seed script — so migrations must be applied explicitly here via a
  // `TEST_MIGRATIONS` binding, read from the same package that owns the schema.
  const migrations = await readD1Migrations(migrationsPath);
  const workersOptions = {
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
  };

  return {
    plugins: [cloudflareTest(workersOptions)],
    test: {
      pool: cloudflarePool(workersOptions),
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
