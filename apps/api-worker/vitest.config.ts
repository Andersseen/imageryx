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
const TEST_API_KEY = "imgx_dev_local";
const TEST_DOWNLOAD_SIGNING_SECRET = "replace-with-local-development-secret";

export default defineConfig(async () => {
  // Test D1 storage is isolated/ephemeral per run — unrelated to `.wrangler/state` used by
  // `wrangler dev` and the seed script — so migrations must be applied explicitly here via a
  // `TEST_MIGRATIONS` binding, read from the same package that owns the schema.
  const migrations = await readD1Migrations(migrationsPath);
  const workersOptions = {
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: {
      bindings: {
        TEST_MIGRATIONS: migrations,
        IMAGERYX_API_KEY: TEST_API_KEY,
        DOWNLOAD_SIGNING_SECRET: TEST_DOWNLOAD_SIGNING_SECRET,
      },
    },
  };

  return {
    plugins: [cloudflareTest(workersOptions)],
    test: {
      pool: cloudflarePool(workersOptions),
      setupFiles: ["./test/apply-migrations.ts"],
      // V8 coverage reports a flat 0% here — the pool runs code inside a real workerd isolate,
      // which V8's coverage API (hooked into the Node process) cannot see into. Istanbul
      // instruments source at transform time instead, so it works across that boundary.
      coverage: {
        provider: "istanbul",
        reporter: ["text", "json-summary"],
        include: ["src/**/*.ts"],
        thresholds: { statements: 65, branches: 50, functions: 60, lines: 70 },
      },
      // Excludes test/integration/**: that suite runs under plain Node (see
      // vitest.integration.config.ts) against a real Miniflare-backed D1 + R2 pair directly —
      // it must never be picked up by this workerd-based pool, which cannot run Node-only code
      // (Miniflare itself, `node:` built-ins) inside the Workers sandbox.
      include: ["test/**/*.spec.ts"],
      exclude: ["test/integration/**"],
    },
  };
});
