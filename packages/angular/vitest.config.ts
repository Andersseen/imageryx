import angular from "@analogjs/vite-plugin-angular";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [angular()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./test-setup.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
