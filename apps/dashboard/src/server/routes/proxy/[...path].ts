import {
  defineEventHandler,
  getHeaders,
  getMethod,
  getQuery,
  getRouterParam,
  readRawBody,
  send,
  setHeader,
  setResponseStatus,
} from "h3";
import { AuthConfigError } from "../../lib/auth/config";
import { getSessionUser } from "../../lib/auth/session";
import { resolveAuthDeps } from "../../lib/auth/runtime";

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
 */
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, "path") ?? "";
  const method = getMethod(event);
  const query = getQuery(event);

  const apiUrl = process.env["API_URL"] || "http://localhost:8787";
  const apiKey =
    process.env["IMAGERYX_INTERNAL_API_KEY"] ??
    process.env["IMAGERYX_API_KEY"] ??
    "imgx_dev_local";

  try {
    const deps = resolveAuthDeps();
    const user = await getSessionUser(event, {
      secret: deps.config.sessionSecret,
      secureCookies: deps.config.secureCookies,
    });
    if (!user) {
      setResponseStatus(event, 401);
      setHeader(event, "content-type", "application/json");
      return send(
        event,
        JSON.stringify({
          error: {
            code: "unauthenticated_dashboard_session",
            message: "Sign in to use the Imageryx dashboard.",
          },
        }),
      );
    }
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

  const url = new URL(`/${path}`, apiUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const incomingHeaders = getHeaders(event);
  const headers = new Headers();
  if (incomingHeaders["content-type"]) {
    headers.set("content-type", incomingHeaders["content-type"]);
  }
  if (incomingHeaders["idempotency-key"]) {
    headers.set("idempotency-key", incomingHeaders["idempotency-key"]);
  }
  headers.set("Authorization", `Bearer ${apiKey}`);

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await readRawBody(event, false) : undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  } catch {
    // A `fetch` rejection here (api-worker down, DNS failure, ECONNREFUSED) previously fell
    // through to Nitro's own generic error page — a body/status the SDK's `ApiErrorEnvelope`
    // parser doesn't recognize, so every page rendered a bare, unhelpful "Server Error". Return
    // the same envelope shape api-worker's own error handler uses, so `describeApiError` renders
    // a normal, safe message instead.
    setResponseStatus(event, 502);
    setHeader(event, "content-type", "application/json");
    return send(
      event,
      JSON.stringify({
        error: {
          code: "upstream_unreachable",
          message: "The API could not be reached.",
        },
      }),
    );
  }

  setResponseStatus(event, response.status);
  response.headers.forEach((value, key) => {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    setHeader(event, key, value);
  });

  const buffer = new Uint8Array(await response.arrayBuffer());
  return send(event, Buffer.from(buffer));
});
