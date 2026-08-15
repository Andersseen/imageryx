import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // `node.spec.ts` boots a real Miniflare D1 and applies every migration, which on a cold
    // CI runner exceeds Vitest's 5s default — it timed out on an unrelated dependabot PR
    // (#51, eslint-plugin-turbo) while passing locally in under a second, i.e. it fails as a
    // function of machine load, not of the change under test. Matches the 20s the `database`
    // package already sets for the same Miniflare-backed setup.
    testTimeout: 20000,
  },
});
