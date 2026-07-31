import { defineConfig, devices } from "@playwright/test";

const DASHBOARD_PORT = 5273;
const API_PORT = 8887;

/**
 * End-to-end configuration for the dashboard, run against a real api-worker.
 *
 * Three decisions worth knowing before changing anything here:
 *
 * 1. **Its own ports and its own state directory.** The dev ports (5173/8787) and
 *    `.wrangler-state` belong to whatever the developer has running; an E2E run that uploaded
 *    into and deleted from that database would be destroying real local work. Everything here
 *    is namespaced to `.wrangler-state-e2e`, so a run is disposable and can never collide with
 *    `pnpm dev`.
 *
 * 2. **`PROCESSING_MODE=inline-local`.** The default queue mode needs a third `wrangler dev`
 *    process (processing-worker) and makes "is it ready yet" depend on real Queue delivery
 *    timing. `inline-local` runs the *same* job handler inside `waitUntil` (see context.md,
 *    "PROCESSING_MODE"), so processing still happens off the request path and is still real —
 *    it just settles predictably, which is what a deterministic E2E flow needs.
 *
 * 3. **No delivery-worker.** Nothing in the Phase 4A flow reads bytes back: thumbnails are only
 *    requested for assets with an already-ready variant, and there are none in this flow. Adding
 *    a third process would add startup time and a failure mode for no coverage.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Uploads, deletes and restores hit one shared database; running them concurrently would make
  // the assertions depend on each other's timing.
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://localhost:${DASHBOARD_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command: `pnpm exec wrangler dev --port ${API_PORT} --inspector-port 9329 --persist-to ../../.wrangler-state-e2e --var PROCESSING_MODE:inline-local --var DASHBOARD_URL:http://localhost:${DASHBOARD_PORT}`,
      cwd: "../api-worker",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // `API_URL` is read by the Nitro proxy route (src/server/routes/api/[...path].ts), which is
      // what injects the Bearer key server-side — the browser never holds it, in E2E either.
      command: `pnpm exec vite --port ${DASHBOARD_PORT} --strictPort`,
      cwd: ".",
      url: `http://localhost:${DASHBOARD_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: {
        API_URL: `http://localhost:${API_PORT}`,
        IMAGERYX_API_KEY: "imgx_dev_local",
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
