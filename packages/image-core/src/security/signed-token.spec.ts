import { describe, expect, it } from "vitest";
import { createSignedToken, verifySignedToken } from "./signed-token";

const SECRET = "local-development-secret";

describe("signed-token", () => {
  it("round-trips a payload through create and verify", async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = await createSignedToken(
      { assetId: "asset-1", variant: "original", exp },
      SECRET,
    );
    const result = await verifySignedToken<{
      assetId: string;
      variant: string;
      exp: number;
    }>(token, SECRET);

    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    if (result.valid) {
      expect(result.payload.assetId).toBe("asset-1");
      expect(result.payload.variant).toBe("original");
    }
  });

  it("reports expired for a token whose exp has passed", async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const token = await createSignedToken({ exp }, SECRET);
    const result = await verifySignedToken(token, SECRET);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = await createSignedToken({ exp }, SECRET);
    const result = await verifySignedToken(token, "a-different-secret");
    expect(result.valid).toBe(false);
  });

  it("rejects a tampered payload even if the signature segment is untouched", async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = await createSignedToken({ assetId: "asset-1", exp }, SECRET);
    const [payload, signature] = token.split(".");
    const tampered = `${payload}x.${signature}`;
    const result = await verifySignedToken(tampered, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed token", async () => {
    const result = await verifySignedToken("not-a-real-token", SECRET);
    expect(result.valid).toBe(false);
  });

  it("never encodes the secret itself into the token", async () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = await createSignedToken({ exp }, SECRET);
    expect(token).not.toContain(SECRET);
  });
});
