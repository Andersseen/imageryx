import { defineEventHandler, send, setHeader, setResponseStatus } from "h3";
import { AuthConfigError } from "../../lib/auth/config";
import { resolveAuthDeps } from "../../lib/auth/runtime";
import { handleProxy } from "../../lib/proxy/proxy-handler";

/**
 * Server-side proxy to `api-worker`, injecting the Bearer API key. This is
 * the "local development proxy" strategy documented in README.md's
 * "Authentication" section — it exists specifically so the browser never
 * needs to hold the API key: this file runs in Nitro's Node server
 * context (via Vite's dev middleware), never bundled into client JS, so
 * `process.env.IMAGERYX_API_KEY` is never shipped to a browser the way a
 * `VITE_`-prefixed variable would be. `IMAGERYX_CLIENT` (`baseUrl: "/proxy"`)
 * routes every page's SDK calls through here, not just `/dev-flow`.
 *
 * Mounted at `/proxy` rather than `/api` deliberately — `/api` is the
 * dashboard's own API-reference *page* route, and Nitro's catch-all file
 * router claims any path under a same-named directory before the SPA ever
 * gets a chance to render that page for a direct load or a refresh.
 *
 * The route is intentionally session-protected. Programmatic consumers still
 * call api-worker directly with their own API key; browser dashboard calls use
 * this proxy and receive the internal server-side credential only after an
 * Imageryx application session has been verified.
 *
 * Only the wiring lives here — the forwarding behaviour is
 * `lib/proxy/proxy-handler.ts`, which is where its tests point.
 */
export default defineEventHandler(async (event) => {
  const apiUrl = process.env["API_URL"] || "http://localhost:8787";
  const apiKey =
    process.env["IMAGERYX_INTERNAL_API_KEY"] ??
    process.env["IMAGERYX_API_KEY"] ??
    "imgx_dev_local";

  let config;
  try {
    config = resolveAuthDeps().config;
  } catch (error) {
    if (error instanceof AuthConfigError) {
      console.error(
        `[auth] dashboard proxy is not configured: ${error.message}`,
      );
      setResponseStatus(event, 503);
      setHeader(event, "content-type", "application/json");
      return send(
        event,
        JSON.stringify({
          error: {
            code: "auth_not_configured",
            message: "Dashboard authentication is not configured.",
          },
        }),
      );
    }
    throw error;
  }

  return handleProxy(event, {
    apiUrl,
    apiKey,
    session: {
      secret: config.sessionSecret,
      secureCookies: config.secureCookies,
    },
  });
});
