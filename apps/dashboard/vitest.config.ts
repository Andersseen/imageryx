import angular from "@analogjs/vite-plugin-angular";
import { defineConfig } from "vitest/config";

/**
 * Deliberately separate from vite.config.ts: this config runs Vitest against the Angular
 * compiler directly (no Analog file-router/Nitro layer), which is all component tests need.
 *
 * Phase 1 tests covered framework-free pure functions only and ran under `environment: "node"`
 * with no Angular plugin at all. Phase 4A adds real component tests (project switcher, library
 * page, upload dialog), which need the Angular plugin plus jsdom — the same combination
 * packages/angular already uses, and whose pitfalls context.md documents (tsconfig.spec.json
 * and tslib must both exist, or decorators silently compile to inert no-ops and every signal
 * input fails at runtime with NG0303).
 */
export default defineConfig({
  plugins: [angular()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./test-setup.ts"],
    globals: false,
  },
});
