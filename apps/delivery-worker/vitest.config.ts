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
      // See api-worker's vitest.config.ts: V8 coverage cannot see into the workerd isolate this
      // pool runs code in, so istanbul (source-instrumented, not runtime-hooked) is used instead.
      coverage: {
        provider: "istanbul",
        reporter: ["text", "json-summary"],
        include: ["src/**/*.ts"],
        thresholds: { statements: 80, branches: 65, functions: 80, lines: 80 },
      },
    },
  };
});
