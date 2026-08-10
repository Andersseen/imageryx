// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  readSessionToken,
  type SessionUser,
} from "./session";

const OPTIONS = { secret: "test-session-secret", secureCookies: false };

const USER: SessionUser = {
  sub: "devauth-user-42",
  email: "andrii@example.com",
  name: "Andrii",
  picture: null,
};

describe("session token", () => {
  it("round-trips the identity, keyed on sub", async () => {
    const { token } = await createSessionToken(USER, OPTIONS);

    await expect(readSessionToken(token, OPTIONS)).resolves.toEqual(USER);
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await createSessionToken(USER, OPTIONS);

    await expect(
      readSessionToken(token, { ...OPTIONS, secret: "another-secret" }),
    ).resolves.toBeNull();
  });

  it("rejects a token whose payload was edited", async () => {
    const { token } = await createSessionToken(USER, OPTIONS);
    const [, signature] = token.split(".");
    const forged = `${btoa(
      JSON.stringify({ sub: "someone-else", exp: 9999999999 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}.${signature}`;

    await expect(readSessionToken(forged, OPTIONS)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const issuedAt = Date.parse("2026-08-09T12:00:00Z");
    const { token, maxAgeSeconds } = await createSessionToken(USER, {
      ...OPTIONS,
      now: () => issuedAt,
    });

    await expect(
      readSessionToken(token, {
        ...OPTIONS,
        now: () => issuedAt + maxAgeSeconds * 1000 - 1000,
      }),
    ).resolves.toEqual(USER);

    await expect(
      readSessionToken(token, {
        ...OPTIONS,
        now: () => issuedAt + maxAgeSeconds * 1000 + 1000,
      }),
    ).resolves.toBeNull();
  });

  it.each([undefined, null, "", "garbage", "no-dot-separator", "a.b.c"])(
    "returns null for malformed input (%s)",
    async (input) => {
      await expect(readSessionToken(input, OPTIONS)).resolves.toBeNull();
    },
  );
});
