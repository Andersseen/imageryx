import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("production config validation", () => {
  it("rejects every request when APP_ENV=production and secrets are still their dev defaults", async () => {
    const originalAppEnv = env.APP_ENV;
    env.APP_ENV = "production";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(500);
    } finally {
      env.APP_ENV = originalAppEnv;
    }
  });

  it("serves requests normally once secrets no longer match their dev defaults", async () => {
    const originalAppEnv = env.APP_ENV;
    const originalApiKey = env.IMAGERYX_API_KEY;
    const originalSigningSecret = env.DOWNLOAD_SIGNING_SECRET;
    env.APP_ENV = "production";
    env.IMAGERYX_API_KEY = "a-real-generated-key";
    env.DOWNLOAD_SIGNING_SECRET = "a-real-generated-secret";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(200);
    } finally {
      env.APP_ENV = originalAppEnv;
      env.IMAGERYX_API_KEY = originalApiKey;
      env.DOWNLOAD_SIGNING_SECRET = originalSigningSecret;
    }
  });

  it("never rejects requests outside production, regardless of secret values", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
  });
});
