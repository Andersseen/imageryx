import {
  getHeaders,
  getMethod,
  getQuery,
  getRouterParam,
  readRawBody,
  send,
  setHeader,
  setResponseStatus,
  type H3Event,
} from "h3";
import { getSessionUser } from "../auth/session";

/**
 * The behaviour of the dashboard's server-side proxy to `api-worker`, split
 * out of the route file the same way `lib/auth/handlers.ts` is split out of
 * the auth routes: the route stays a thin binding to `process.env` and the
 * real `fetch`, and everything that can be wrong — the session gate, which
 * headers cross, whether the body survives, how an upstream error is
 * reported — is a function a test can drive. See proxy-handler.spec.ts.
 */
export interface ProxyDeps {
  /** Origin of `api-worker`. */
  apiUrl: string;
  /** The internal API key injected server-side; the browser never holds it. */
  apiKey: string;
  session: { secret: string; secureCookies: boolean };
  /** Overridable so a test can assert on the upstream request without a network. */
  fetch?: typeof fetch;
}

/**
 * Response headers that describe *this* hop's transfer, not the payload.
 * Forwarding them re-declares an encoding/length that no longer applies once
 * the body has been decoded and re-sent, which browsers read as a corrupt
 * response.
 */
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

/** api-worker's own envelope shape, so `describeApiError` renders these the same as a real API error. */
function errorEnvelope(code: string, message: string): string {
  return JSON.stringify({ error: { code, message } });
}

export async function handleProxy(
  event: H3Event,
  deps: ProxyDeps,
): Promise<unknown> {
  const user = await getSessionUser(event, {
    secret: deps.session.secret,
    secureCookies: deps.session.secureCookies,
  });
  if (!user) {
    setResponseStatus(event, 401);
    setHeader(event, "content-type", "application/json");
    return send(
      event,
      errorEnvelope(
        "unauthenticated_dashboard_session",
        "Sign in to use the Imageryx dashboard.",
      ),
    );
  }

  const path = getRouterParam(event, "path") ?? "";
  const method = getMethod(event);
  const query = getQuery(event);

  const url = new URL(`/${path}`, deps.apiUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  // An allowlist, not a copy: the browser's own `cookie` and `authorization`
  // headers must never reach api-worker, and `content-length` is recomputed by
  // `fetch` for the body actually sent.
  const incomingHeaders = getHeaders(event);
  const headers = new Headers();
  if (incomingHeaders["content-type"]) {
    headers.set("content-type", incomingHeaders["content-type"]);
  }
  if (incomingHeaders["idempotency-key"]) {
    headers.set("idempotency-key", incomingHeaders["idempotency-key"]);
  }
  headers.set("Authorization", `Bearer ${deps.apiKey}`);

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await readRawBody(event, false) : undefined;

  const fetchImpl = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
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
      errorEnvelope("upstream_unreachable", "The API could not be reached."),
    );
  }

  setResponseStatus(event, response.status);
  response.headers.forEach((value, key) => {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    setHeader(event, key, value);
  });

  const buffer = new Uint8Array(await response.arrayBuffer());
  return send(event, Buffer.from(buffer));
}
