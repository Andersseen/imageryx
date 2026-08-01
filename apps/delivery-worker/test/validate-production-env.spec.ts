import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("production config validation", () => {
  it("rejects every request when APP_ENV=production and the signing secret is still its dev default", async () => {
    const originalAppEnv = env.APP_ENV;
    env.APP_ENV = "production";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(500);
    } finally {
      env.APP_ENV = originalAppEnv;
    }
  });

  it("serves requests normally once the signing secret no longer matches its dev default", async () => {
    const originalAppEnv = env.APP_ENV;
    const originalSigningSecret = env.DOWNLOAD_SIGNING_SECRET;
    env.APP_ENV = "production";
    env.DOWNLOAD_SIGNING_SECRET = "a-real-generated-secret";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(200);
    } finally {
      env.APP_ENV = originalAppEnv;
      env.DOWNLOAD_SIGNING_SECRET = originalSigningSecret;
    }
  });

  it("never rejects requests outside production, regardless of the signing secret value", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
  });
});
