import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    testTimeout: 20000,
    // Repositories sit in the low 50-70% range today (real, not-yet-covered branches, not an
    // artifact of the threshold) — set at the measured baseline so CI catches a regression
    // without demanding this phase's scope stretch into exhaustively testing every repository.
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      thresholds: { statements: 60, branches: 65, functions: 70, lines: 65 },
    },
  },
});
