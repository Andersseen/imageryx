import { defineConfig } from "vitest/config";

/**
 * Deliberately plain Node (no `@cloudflare/vitest-pool-workers`): this
 * suite exercises the same handler *functions* the Workers use, directly,
 * against a real Miniflare-backed D1 + R2 pair — see context.md's
 * "End-to-end backend integration test" note for why this is the chosen
 * shape instead of a multi-worker service-binding topology.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
