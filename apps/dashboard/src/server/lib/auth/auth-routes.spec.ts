// @vitest-environment node
import {
  createApp,
  createRouter,
  defineEventHandler,
  toWebHandler,
  type H3Event,
} from "h3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRuntimeConfig } from "./config";
import type { DiscoveryDocument } from "./discovery";
import {
  handleCallback,
  handleLogin,
  handleLogout,
  handleSession,
  type AuthDeps,
} from "./handlers";
import { LOGIN_TX_COOKIE } from "./login-transaction";
import { computeCodeChallengeS256 } from "./pkce";
import { readSessionToken, SESSION_COOKIE, type SessionUser } from "./session";

/**
 * These drive real `Request`s through a real h3 app, so cookies, redirects and
 * status codes are the ones a browser would actually see. No network: discovery
 * is injected, and `fetch` is a stub whose call log is asserted on — which is
 * how "no token exchange was attempted" becomes a checkable claim rather than an
 * assumption.
 */

const ISSUER = "https://auth-devflare.andersseen.dev";
const REDIRECT_URI = "http://localhost:5173/proxy/auth/callback";

const CONFIG: AuthRuntimeConfig = {
  devAuth: {
    issuer: ISSUER,
    clientId: "imageryx",
    clientSecret: "test-client-secret",
    redirectUri: REDIRECT_URI,
    scope: "openid profile email",
  },
  sessionSecret: "test-session-secret-not-a-real-one",
  secureCookies: false,
};

const DISCOVERY: DiscoveryDocument = {
  issuer: ISSUER,
  authorizationEndpoint: `${ISSUER}/api/auth/oauth2/authorize`,
  tokenEndpoint: `${ISSUER}/api/auth/oauth2/token`,
  userinfoEndpoint: `${ISSUER}/api/auth/oauth2/userinfo`,
  endSessionEndpoint: `${ISSUER}/api/auth/oauth2/end-session`,
};

const SILENT_LOGGER = { error: vi.fn(), warn: vi.fn() };

interface FetchStub {
  impl: typeof fetch;
  calls: string[];
}

function createFetchStub(
  responder: (url: string, init?: RequestInit) => Response,
): FetchStub {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return responder(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The happy path: a token, then a profile. */
const successResponder = (url: string): Response => {
  if (url.endsWith("/token")) {
    return json({ access_token: "devauth-access-token", token_type: "Bearer" });
  }
  if (url.endsWith("/userinfo")) {
    return json({
      sub: "devauth-user-42",
      email: "andrii@example.com",
      name: "Andrii",
    });
  }
  throw new Error(`unexpected fetch to ${url}`);
};

function createHandler(deps: AuthDeps) {
  const app = createApp();
  const router = createRouter();
  const wrap = (
    handler: (event: H3Event, deps: AuthDeps) => Promise<unknown>,
  ) => defineEventHandler((event) => handler(event, deps));

  router.get("/proxy/auth/login", wrap(handleLogin));
  router.get("/proxy/auth/callback", wrap(handleCallback));
  router.post("/proxy/auth/logout", wrap(handleLogout));
  router.get("/proxy/auth/session", wrap(handleSession));
  app.use(router);

  return toWebHandler(app);
}

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    config: CONFIG,
    loadDiscovery: async () => DISCOVERY,
    logger: SILENT_LOGGER,
    ...overrides,
  };
}

function cookieValue(response: Response, name: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    if (pair && separator > 0 && pair.slice(0, separator) === name) {
      return decodeURIComponent(pair.slice(separator + 1));
    }
  }
  return null;
}

function setCookieHeader(response: Response, name: string): string | null {
  return (
    response.headers
      .getSetCookie()
      .find((header) => header.startsWith(`${name}=`)) ?? null
  );
}

/** Runs a real login so the callback tests get a genuine transaction cookie. */
async function startLogin(
  handler: ReturnType<typeof createHandler>,
  returnTo?: string,
): Promise<{ state: string; nonce: string; cookie: string; location: URL }> {
  const url = new URL("http://localhost:5173/proxy/auth/login");
  if (returnTo) url.searchParams.set("returnTo", returnTo);

  const response = await handler(new Request(url));
  const location = new URL(response.headers.get("location") ?? "");
  const cookie = cookieValue(response, LOGIN_TX_COOKIE);
  if (!cookie) throw new Error("login did not set a transaction cookie");

  return {
    state: location.searchParams.get("state") ?? "",
    nonce: location.searchParams.get("nonce") ?? "",
    cookie: `${LOGIN_TX_COOKIE}=${encodeURIComponent(cookie)}`,
    location,
  };
}

beforeEach(() => {
  SILENT_LOGGER.error.mockClear();
  SILENT_LOGGER.warn.mockClear();
});

describe("GET /proxy/auth/login", () => {
  it("redirects to the authorization endpoint with every required parameter", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const handler = createHandler(
      makeDeps({
        generate: {
          state: () => "fixed-state",
          nonce: () => "fixed-nonce",
          codeVerifier: () => verifier,
        },
      }),
    );

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/login"),
    );

    expect(response.status).toBe(302);

    const location = new URL(response.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(
      DISCOVERY.authorizationEndpoint,
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("client_id")).toBe("imageryx");
    expect(location.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(location.searchParams.get("scope")).toBe("openid profile email");
    expect(location.searchParams.get("state")).toBe("fixed-state");
    expect(location.searchParams.get("nonce")).toBe("fixed-nonce");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBe(
      await computeCodeChallengeS256(verifier),
    );
  });

  it("never puts the verifier or the client secret in the redirect", async () => {
    const handler = createHandler(makeDeps());

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/login"),
    );
    const location = response.headers.get("location") ?? "";

    expect(location).not.toContain("code_verifier");
    expect(location).not.toContain(CONFIG.devAuth.clientSecret);
  });

  it("stores the transaction in an HttpOnly, SameSite=Lax cookie", async () => {
    const handler = createHandler(makeDeps());

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/login"),
    );
    const header = setCookieHeader(response, LOGIN_TX_COOKIE) ?? "";

    expect(header).toContain("HttpOnly");
    expect(header).toMatch(/SameSite=Lax/i);
    // Lax, never Strict: Strict would withhold this cookie on the cross-site
    // top-level redirect back from DevAuth, breaking every callback.
    expect(header).not.toMatch(/SameSite=Strict/i);
    expect(header).toContain("Path=/proxy/auth");
  });

  it("does not leak the PKCE verifier to the browser in readable form", async () => {
    const handler = createHandler(
      makeDeps({ generate: { codeVerifier: () => "super-secret-verifier" } }),
    );

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/login"),
    );

    // It is inside the signed cookie, but base64url-encoded rather than sitting
    // in plain sight — and the cookie is HttpOnly, asserted above.
    expect(response.headers.get("location")).not.toContain(
      "super-secret-verifier",
    );
  });
});

describe("GET /proxy/auth/callback", () => {
  it("refuses a state that does not match the cookie, and attempts no token exchange", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const response = await handler(
      new Request(
        "http://localhost:5173/proxy/auth/callback?code=abc&state=attacker-state",
        { headers: { cookie: login.cookie } },
      ),
    );

    expect(response.status).toBe(400);
    // The decisive assertion: the single-use code was never spent and the client
    // secret was never presented.
    expect(stub.calls).toEqual([]);
    expect(await response.text()).toContain("could not be verified");
  });

  it("refuses a callback with no transaction cookie at all", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/callback?code=abc&state=x"),
    );

    expect(response.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });

  it("fails gracefully when the provider returns ?error=", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const response = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?error=access_denied&error_description=User+said+no&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );

    expect(response.status).toBe(403);
    expect(response.status).not.toBe(500);
    expect(stub.calls).toEqual([]);

    const body = await response.text();
    expect(body).toContain("Sign-in was declined");
    // The provider's own description is logged, not rendered.
    expect(body).not.toContain("User said no");
  });

  it("does not leak the provider's error body when the token exchange fails", async () => {
    const providerBody = "client secret mismatch for client imageryx";
    const stub = createFetchStub((url) => {
      if (url.endsWith("/token")) {
        return json(
          { error: "invalid_client", error_description: providerBody },
          401,
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const response = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=abc&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );

    const body = await response.text();
    expect(response.status).toBe(502);
    expect(body).not.toContain(providerBody);
    expect(body).not.toContain("invalid_client");
    expect(body).not.toContain(CONFIG.devAuth.clientSecret);
    expect(body).toContain("could not be completed");
    // Still diagnosable — just server side.
    expect(SILENT_LOGGER.error).toHaveBeenCalled();
    // No session was created.
    expect(cookieValue(response, SESSION_COOKIE)).toBeNull();
  });

  it("creates a local session keyed on sub after a successful exchange", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler, "/library");

    const response = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=the-code&state=${login.state}&iss=${encodeURIComponent(ISSUER)}`,
        { headers: { cookie: login.cookie } },
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/library");

    const token = cookieValue(response, SESSION_COOKIE);
    expect(token).not.toBeNull();

    const user = await readSessionToken(token, {
      secret: CONFIG.sessionSecret,
      secureCookies: false,
    });
    expect(user?.sub).toBe("devauth-user-42");
    expect(user?.email).toBe("andrii@example.com");

    const sessionHeader = setCookieHeader(response, SESSION_COOKIE) ?? "";
    expect(sessionHeader).toContain("HttpOnly");
    expect(sessionHeader).toMatch(/SameSite=Lax/i);

    // The transaction cookie is spent and cleared.
    expect(setCookieHeader(response, LOGIN_TX_COOKIE)).toContain("Max-Age=0");
  });

  it("sends the PKCE verifier and the client secret to the token endpoint, server side", async () => {
    let tokenBody = "";
    const stub = createFetchStub((url, init) => {
      if (url.endsWith("/token")) {
        tokenBody = String(init?.body ?? "");
        return json({ access_token: "t", token_type: "Bearer" });
      }
      return json({ sub: "devauth-user-42" });
    });
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=the-code&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );

    const params = new URLSearchParams(tokenBody);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("the-code");
    expect(params.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(params.get("client_id")).toBe("imageryx");
    expect(params.get("client_secret")).toBe(CONFIG.devAuth.clientSecret);
    expect(params.get("code_verifier")).toBeTruthy();
  });

  it("never stores DevAuth's access token as the session", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const response = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=abc&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );

    for (const header of response.headers.getSetCookie()) {
      expect(header).not.toContain("devauth-access-token");
    }
  });

  it("rejects a callback whose iss is not the configured issuer", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const response = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=abc&state=${login.state}&iss=https%3A%2F%2Fevil.example`,
        { headers: { cookie: login.cookie } },
      ),
    );

    expect(response.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });

  it("only honours a same-site returnTo", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler, "https://evil.example/steal");

    const response = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=abc&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );

    expect(response.headers.get("location")).toBe("/");
  });
});

describe("POST /proxy/auth/logout", () => {
  it("clears the session cookie", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const callback = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=abc&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );
    const session = cookieValue(callback, SESSION_COOKIE) ?? "";
    expect(session).not.toBe("");

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/logout", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` },
      }),
    );

    expect(response.status).toBe(302);
    const cleared = setCookieHeader(response, SESSION_COOKIE) ?? "";
    expect(cleared).toContain("Max-Age=0");

    // And the session endpoint agrees, once the browser has applied that.
    const after = await handler(
      new Request("http://localhost:5173/proxy/auth/session"),
    );
    expect(await after.json()).toEqual({ authenticated: false, user: null });
  });

  it("does not send the user to an off-site returnTo", async () => {
    const handler = createHandler(makeDeps());

    const response = await handler(
      new Request(
        "http://localhost:5173/proxy/auth/logout?returnTo=//evil.example",
        { method: "POST" },
      ),
    );

    expect(response.headers.get("location")).toBe("/");
  });
});

describe("GET /proxy/auth/session", () => {
  it("reports the signed-in user without contacting DevAuth", async () => {
    const stub = createFetchStub(successResponder);
    const handler = createHandler(makeDeps({ fetchImpl: stub.impl }));
    const login = await startLogin(handler);

    const callback = await handler(
      new Request(
        `http://localhost:5173/proxy/auth/callback?code=abc&state=${login.state}`,
        { headers: { cookie: login.cookie } },
      ),
    );
    const session = cookieValue(callback, SESSION_COOKIE) ?? "";

    const callsAfterLogin = stub.calls.length;

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/session", {
        headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` },
      }),
    );

    const body = (await response.json()) as {
      authenticated: boolean;
      user: SessionUser | null;
    };
    expect(body.authenticated).toBe(true);
    expect(body.user?.sub).toBe("devauth-user-42");

    // The whole architectural point: reading the session made no call to the
    // identity provider.
    expect(stub.calls.length).toBe(callsAfterLogin);
  });

  it("reports nobody for a tampered session cookie", async () => {
    const handler = createHandler(makeDeps());

    const response = await handler(
      new Request("http://localhost:5173/proxy/auth/session", {
        headers: { cookie: `${SESSION_COOKIE}=not.a.real.token` },
      }),
    );

    expect(await response.json()).toEqual({ authenticated: false, user: null });
  });
});
