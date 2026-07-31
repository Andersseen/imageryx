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
 * Dev-only in practice: this dashboard currently deploys as a static SPA
 * (`ssr: false`, `wrangler pages deploy dist/client`) — this route is not
 * verified to run in that production deployment.
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
  const apiKey = process.env["IMAGERYX_API_KEY"] || "imgx_dev_local";

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

  const response = await fetch(url, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });

  setResponseStatus(event, response.status);
  response.headers.forEach((value, key) => {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    setHeader(event, key, value);
  });

  const buffer = new Uint8Array(await response.arrayBuffer());
  return send(event, Buffer.from(buffer));
});
