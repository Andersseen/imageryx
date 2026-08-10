// @vitest-environment node
// Node, not this project's default jsdom: jsdom supplies a `crypto` global with
// no `subtle` at all, so every Web Crypto call here would throw on a property
// jsdom simply does not implement.
import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  computeCodeChallengeS256,
  createCodeVerifier,
  randomUrlSafeToken,
} from "./pkce";

describe("computeCodeChallengeS256", () => {
  it("matches the RFC 7636 appendix B test vector", async () => {
    // The one published input/output pair for S256. If this drifts, every
    // authorization request this client sends is wrong in a way DevAuth would
    // only reveal as a generic failure at token exchange.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    await expect(computeCodeChallengeS256(verifier)).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("produces an unpadded, URL-safe challenge", async () => {
    const challenge = await computeCodeChallengeS256(createCodeVerifier());

    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain("=");
  });
});

describe("createCodeVerifier", () => {
  it("stays inside RFC 7636's 43..128 character range", () => {
    expect(createCodeVerifier()).toHaveLength(43);
  });

  it("does not repeat", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createCodeVerifier()),
    );

    expect(tokens.size).toBe(50);
  });
});

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);

    expect(Array.from(base64UrlDecode(base64UrlEncode(bytes)))).toEqual(
      Array.from(bytes),
    );
  });

  it("emits no characters that would need escaping in a query string", () => {
    for (let i = 0; i < 25; i += 1) {
      expect(randomUrlSafeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
