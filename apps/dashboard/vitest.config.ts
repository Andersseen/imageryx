import { defineConfig } from 'vitest/config';

/**
 * Deliberately separate from vite.config.ts: Phase 1 dashboard tests only
 * cover framework-free pure functions (env parsing, health-status mapping),
 * so this config skips the Angular/Analog plugin pipeline entirely.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
