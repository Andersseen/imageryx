// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDiscoveryLoader, DiscoveryError } from "./discovery";

const ISSUER = "https://auth-devflare.andersseen.dev";

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`,
    token_endpoint: `${ISSUER}/api/auth/oauth2/token`,
    userinfo_endpoint: `${ISSUER}/api/auth/oauth2/userinfo`,
    jwks_uri: `${ISSUER}/api/auth/jwks`,
    end_session_endpoint: `${ISSUER}/api/auth/oauth2/end-session`,
    ...overrides,
  };
}

function stubFetch(responder: (url: string) => Response) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return responder(url);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createDiscoveryLoader", () => {
  it("reads endpoints from the OpenID configuration rather than hardcoding them", async () => {
    const fetchStub = stubFetch(() => json(metadata()));
    const load = createDiscoveryLoader({ fetchImpl: fetchStub.impl });

    const document = await load(ISSUER);

    expect(fetchStub.calls).toEqual([
      `${ISSUER}/.well-known/openid-configuration`,
    ]);
    expect(document.authorizationEndpoint).toBe(
      `${ISSUER}/api/auth/oauth2/authorize`,
    );
    expect(document.tokenEndpoint).toBe(`${ISSUER}/api/auth/oauth2/token`);
    expect(document.userinfoEndpoint).toBe(
      `${ISSUER}/api/auth/oauth2/userinfo`,
    );
    expect(document.endSessionEndpoint).toBe(
      `${ISSUER}/api/auth/oauth2/end-session`,
    );
  });

  it("falls back to the OAuth authorization-server document", async () => {
    const fetchStub = stubFetch((url) =>
      url.endsWith("openid-configuration")
        ? new Response("nope", { status: 404 })
        : json(metadata()),
    );
    const load = createDiscoveryLoader({ fetchImpl: fetchStub.impl });

    await expect(load(ISSUER)).resolves.toMatchObject({ issuer: ISSUER });
    expect(fetchStub.calls).toHaveLength(2);
  });

  it("refuses a document whose issuer is not the one configured", async () => {
    // Otherwise a mistyped DEV_AUTH_URL would hand the authorization redirect —
    // and the client secret at token exchange — to whatever host answered.
    const fetchStub = stubFetch(() =>
      json(metadata({ issuer: "https://evil.example" })),
    );
    const load = createDiscoveryLoader({ fetchImpl: fetchStub.impl });

    await expect(load(ISSUER)).rejects.toThrow(DiscoveryError);
  });

  it("refuses a document missing a required endpoint", async () => {
    const fetchStub = stubFetch(() =>
      json(metadata({ token_endpoint: undefined })),
    );
    const load = createDiscoveryLoader({ fetchImpl: fetchStub.impl });

    await expect(load(ISSUER)).rejects.toThrow(/token/i);
  });

  it("caches within the TTL and refetches after it", async () => {
    let clock = 0;
    const fetchStub = stubFetch(() => json(metadata()));
    const load = createDiscoveryLoader({
      fetchImpl: fetchStub.impl,
      ttlMs: 1000,
      now: () => clock,
    });

    await load(ISSUER);
    await load(ISSUER);
    expect(fetchStub.calls).toHaveLength(1);

    clock = 2000;
    await load(ISSUER);
    expect(fetchStub.calls).toHaveLength(2);
  });

  it("reports both attempts when the issuer is unreachable", async () => {
    const fetchStub = stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const load = createDiscoveryLoader({ fetchImpl: fetchStub.impl });

    await expect(load(ISSUER)).rejects.toThrow(DiscoveryError);
    expect(fetchStub.calls).toHaveLength(2);
  });
});
