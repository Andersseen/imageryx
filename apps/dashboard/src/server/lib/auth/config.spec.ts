// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AuthConfigError, readAuthConfig } from "./config";

const VALID = {
  DEV_AUTH_URL: "https://auth-devflare.andersseen.dev",
  DEV_AUTH_CLIENT_ID: "imageryx",
  DEV_AUTH_CLIENT_SECRET: "a-secret",
  DEV_AUTH_REDIRECT_URI: "https://imageryx.andersseen.dev/proxy/auth/callback",
  SESSION_SECRET: "a-session-secret",
};

describe("readAuthConfig", () => {
  it("reads a complete configuration", () => {
    const config = readAuthConfig(VALID);

    expect(config.devAuth.issuer).toBe("https://auth-devflare.andersseen.dev");
    expect(config.devAuth.clientId).toBe("imageryx");
    expect(config.devAuth.scope).toBe("openid profile email");
    expect(config.secureCookies).toBe(true);
  });

  it("does not request offline_access by default", () => {
    // No refresh token is wanted: this app never calls DevAuth after the
    // callback, so a stored refresh token would be a credential with no consumer.
    expect(readAuthConfig(VALID).devAuth.scope).not.toContain("offline_access");
  });

  it("strips a trailing slash from the issuer so discovery URLs stay well-formed", () => {
    expect(
      readAuthConfig({
        ...VALID,
        DEV_AUTH_URL: "https://auth-devflare.andersseen.dev/",
      }).devAuth.issuer,
    ).toBe("https://auth-devflare.andersseen.dev");
  });

  it("marks cookies insecure only for a plain-http (localhost) redirect URI", () => {
    expect(
      readAuthConfig({
        ...VALID,
        DEV_AUTH_REDIRECT_URI: "http://localhost:5173/proxy/auth/callback",
      }).secureCookies,
    ).toBe(false);
  });

  it.each([
    "DEV_AUTH_URL",
    "DEV_AUTH_CLIENT_ID",
    "DEV_AUTH_CLIENT_SECRET",
    "DEV_AUTH_REDIRECT_URI",
    "SESSION_SECRET",
  ])("throws a named error when %s is missing", (key) => {
    const env: Record<string, string | undefined> = { ...VALID };
    delete env[key];

    expect(() => readAuthConfig(env)).toThrow(AuthConfigError);
    expect(() => readAuthConfig(env)).toThrow(key);
  });

  it.each([
    ["https://app.example/callback?x=1", "a query string"],
    ["https://app.example/callback#frag", "a fragment"],
    ["not-a-url", "a relative value"],
  ])("rejects a redirect URI carrying %s (%s)", (redirectUri) => {
    // DevAuth matches the redirect URI byte for byte and refuses a mismatch on
    // its own error page — which never reaches this app's logs. Catching the
    // malformed shapes here is the only place the problem is diagnosable.
    expect(() =>
      readAuthConfig({ ...VALID, DEV_AUTH_REDIRECT_URI: redirectUri }),
    ).toThrow(AuthConfigError);
  });
});
