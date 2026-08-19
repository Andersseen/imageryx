// @vitest-environment node
import { createApp, createRouter, defineEventHandler, toWebHandler } from "h3";
import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "../auth/session";
import { handleProxy, type ProxyDeps } from "./proxy-handler";

/**
 * The proxy is the hop every dashboard API call makes, and the one the
 * browser's devtools blames when an upload fails — so what it does with a
 * multipart body, an upstream error envelope and an unauthenticated request
 * are all assertions worth having.
 *
 * Real `Request`s through a real h3 app, so the status, headers and cookies
 * are the ones a browser would see. No network: `fetch` is a stub whose
 * received request is captured, which is what makes "the API key was
 * injected, and the browser's own cookie was not forwarded" checkable
 * rather than assumed.
 */

const API_URL = "http://api-worker.test";
const API_KEY = "imgx_internal_test_key";
const SESSION_SECRET = "test-session-secret-not-a-real-one";

interface UpstreamCall {
  url: string;
  method: string;
  headers: Headers;
  body: Uint8Array | null;
}

interface Upstream {
  calls: UpstreamCall[];
  fetch: typeof fetch;
}

function createUpstream(
  responder: (call: UpstreamCall) => Response | Promise<Response>,
): Upstream {
  const calls: UpstreamCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as RequestInfo, init);
    const bytes = ["GET", "HEAD"].includes(request.method)
      ? null
      : new Uint8Array(await request.arrayBuffer());
    const call: UpstreamCall = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: bytes,
    };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  return { calls, fetch: impl };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createHandler(deps: Partial<ProxyDeps> = {}) {
  const app = createApp();
  const router = createRouter();
  router.use(
    "/proxy/**:path",
    defineEventHandler((event) =>
      handleProxy(event, {
        apiUrl: API_URL,
        apiKey: API_KEY,
        session: { secret: SESSION_SECRET, secureCookies: false },
        ...deps,
      }),
    ),
  );
  app.use(router);
  return toWebHandler(app);
}

let sessionCookie: string;

beforeEach(async () => {
  const { token } = await createSessionToken(
    {
      sub: "devauth-user-42",
      email: "andrii@example.com",
      name: null,
      picture: null,
    },
    { secret: SESSION_SECRET, secureCookies: false },
  );
  sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
});

/** A multipart body shaped like the upload dialog's, so "the file survived the hop" is testable. */
async function uploadBody(): Promise<{ body: FormData; bytes: Uint8Array }> {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const form = new FormData();
  form.set("projectId", "project-1");
  form.set("file", new File([bytes], "hero.png", { type: "image/png" }));
  return { body: form, bytes };
}

describe("the dashboard proxy", () => {
  it("refuses an unauthenticated call and never reaches api-worker with it", async () => {
    const upstream = createUpstream(() => json({ items: [] }));
    const handler = createHandler({ fetch: upstream.fetch });

    const response = await handler(
      new Request("http://localhost:5173/proxy/v1/assets?projectId=p-1"),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthenticated_dashboard_session");
    // The internal API key must not be spendable by an unauthenticated caller.
    expect(upstream.calls).toHaveLength(0);
  });

  it("injects the internal API key server-side, and forwards neither the browser's cookie nor its Authorization header", async () => {
    const upstream = createUpstream(() => json({ items: [] }));
    const handler = createHandler({ fetch: upstream.fetch });

    await handler(
      new Request("http://localhost:5173/proxy/v1/assets", {
        headers: {
          cookie: `${sessionCookie}; other=value`,
          authorization: "Bearer a-key-the-browser-should-not-be-holding",
        },
      }),
    );

    const call = upstream.calls[0];
    expect(call?.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(call?.headers.get("cookie")).toBeNull();
  });

  it("forwards a multipart upload body to api-worker byte for byte", async () => {
    const upstream = createUpstream(() =>
      json({ asset: { id: "a-1" }, processingJobId: "job-1" }, 201),
    );
    const handler = createHandler({ fetch: upstream.fetch });
    const { body, bytes } = await uploadBody();

    const response = await handler(
      new Request("http://localhost:5173/proxy/v1/assets/upload", {
        method: "POST",
        headers: { cookie: sessionCookie },
        body,
      }),
    );

    expect(response.status).toBe(201);
    const call = upstream.calls[0];
    expect(call?.url).toBe(`${API_URL}/v1/assets/upload`);
    expect(call?.method).toBe("POST");
    expect(call?.headers.get("content-type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );

    // Re-parsed upstream rather than compared as opaque bytes: what matters is
    // that api-worker can still read the file part and the fields.
    const received = await new Response(call?.body, {
      headers: { "content-type": call?.headers.get("content-type") ?? "" },
    }).formData();
    expect(received.get("projectId")).toBe("project-1");
    const file = received.get("file") as File;
    expect(file.name).toBe("hero.png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("passes an upstream error envelope through unchanged, so the dialog can show the API's own message", async () => {
    const upstream = createUpstream(() =>
      json(
        {
          error: {
            code: "unsupported_media_type",
            message: "The uploaded file failed MIME type validation.",
            requestId: "req-7",
          },
        },
        415,
      ),
    );
    const handler = createHandler({ fetch: upstream.fetch });
    const { body } = await uploadBody();

    const response = await handler(
      new Request("http://localhost:5173/proxy/v1/assets/upload", {
        method: "POST",
        headers: { cookie: sessionCookie },
        body,
      }),
    );

    expect(response.status).toBe(415);
    const parsed = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(parsed.error.code).toBe("unsupported_media_type");
    expect(parsed.error.message).toBe(
      "The uploaded file failed MIME type validation.",
    );
    expect(parsed.error.requestId).toBe("req-7");
  });

  it("reports an unreachable api-worker as a parseable envelope, not a generic server error page", async () => {
    const handler = createHandler({
      fetch: (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch,
    });

    const response = await handler(
      new Request("http://localhost:5173/proxy/v1/assets", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("upstream_unreachable");
  });

  it("forwards query parameters and the idempotency key", async () => {
    const upstream = createUpstream(() => json({ items: [] }));
    const handler = createHandler({ fetch: upstream.fetch });

    await handler(
      new Request(
        "http://localhost:5173/proxy/v1/assets?projectId=p-1&status=ready",
        {
          method: "POST",
          headers: {
            cookie: sessionCookie,
            "idempotency-key": "key-123",
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
    );

    const call = upstream.calls[0];
    const url = new URL(call?.url ?? "");
    expect(url.searchParams.get("projectId")).toBe("p-1");
    expect(url.searchParams.get("status")).toBe("ready");
    expect(call?.headers.get("idempotency-key")).toBe("key-123");
  });

  it("sends no body on a GET, so api-worker sees a plain read", async () => {
    const upstream = createUpstream(() => json({ items: [] }));
    const handler = createHandler({ fetch: upstream.fetch });

    await handler(
      new Request("http://localhost:5173/proxy/v1/projects", {
        headers: { cookie: sessionCookie },
      }),
    );

    expect(upstream.calls[0]?.body).toBeNull();
  });

  it("drops hop-by-hop response headers while keeping the payload's own", async () => {
    const upstream = createUpstream(
      () =>
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "x-request-id": "req-9",
          },
        }),
    );
    const handler = createHandler({ fetch: upstream.fetch });

    const response = await handler(
      new Request("http://localhost:5173/proxy/v1/assets", {
        headers: { cookie: sessionCookie },
      }),
    );

    // The body was decoded and re-sent, so re-declaring gzip would make it unreadable.
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("x-request-id")).toBe("req-9");
    expect(await response.json()).toEqual({ items: [] });
  });

  it("rejects a tampered session cookie the same as no session at all", async () => {
    const upstream = createUpstream(() => json({ items: [] }));
    const handler = createHandler({ fetch: upstream.fetch });

    const response = await handler(
      new Request("http://localhost:5173/proxy/v1/assets", {
        headers: { cookie: `${SESSION_COOKIE}=not.a.valid.token` },
      }),
    );

    expect(response.status).toBe(401);
    expect(upstream.calls).toHaveLength(0);
  });
});
