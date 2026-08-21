import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const envAny = env as unknown as Record<string, string | undefined>;

describe("production config validation", () => {
  it("rejects every request when APP_ENV=production and TRANSFORMATION_PROVIDER=cloudinary with missing cloudinary secrets", async () => {
    const originalAppEnv = envAny.APP_ENV;
    const originalProvider = envAny.TRANSFORMATION_PROVIDER;
    const originalCloudName = envAny.CLOUDINARY_CLOUD_NAME;
    const originalApiKey = envAny.CLOUDINARY_API_KEY;
    const originalApiSecret = envAny.CLOUDINARY_API_SECRET;
    envAny.APP_ENV = "production";
    envAny.TRANSFORMATION_PROVIDER = "cloudinary";
    envAny.CLOUDINARY_CLOUD_NAME = "";
    envAny.CLOUDINARY_API_KEY = "";
    envAny.CLOUDINARY_API_SECRET = "";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(500);
    } finally {
      envAny.APP_ENV = originalAppEnv;
      envAny.TRANSFORMATION_PROVIDER = originalProvider;
      envAny.CLOUDINARY_CLOUD_NAME = originalCloudName;
      envAny.CLOUDINARY_API_KEY = originalApiKey;
      envAny.CLOUDINARY_API_SECRET = originalApiSecret;
    }
  });

  it("serves requests normally when APP_ENV=production and cloudinary secrets are set", async () => {
    const originalAppEnv = envAny.APP_ENV;
    const originalProvider = envAny.TRANSFORMATION_PROVIDER;
    const originalCloudName = envAny.CLOUDINARY_CLOUD_NAME;
    const originalApiKey = envAny.CLOUDINARY_API_KEY;
    const originalApiSecret = envAny.CLOUDINARY_API_SECRET;
    envAny.APP_ENV = "production";
    envAny.TRANSFORMATION_PROVIDER = "cloudinary";
    envAny.CLOUDINARY_CLOUD_NAME = "real-cloud-name";
    envAny.CLOUDINARY_API_KEY = "real-api-key";
    envAny.CLOUDINARY_API_SECRET = "real-api-secret";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(200);
    } finally {
      envAny.APP_ENV = originalAppEnv;
      envAny.TRANSFORMATION_PROVIDER = originalProvider;
      envAny.CLOUDINARY_CLOUD_NAME = originalCloudName;
      envAny.CLOUDINARY_API_KEY = originalApiKey;
      envAny.CLOUDINARY_API_SECRET = originalApiSecret;
    }
  });

  it("does not require cloudinary secrets when TRANSFORMATION_PROVIDER=mock", async () => {
    const originalAppEnv = envAny.APP_ENV;
    const originalProvider = envAny.TRANSFORMATION_PROVIDER;
    const originalCloudName = envAny.CLOUDINARY_CLOUD_NAME;
    const originalApiKey = envAny.CLOUDINARY_API_KEY;
    const originalApiSecret = envAny.CLOUDINARY_API_SECRET;
    envAny.APP_ENV = "production";
    envAny.TRANSFORMATION_PROVIDER = "mock";
    envAny.CLOUDINARY_CLOUD_NAME = "";
    envAny.CLOUDINARY_API_KEY = "";
    envAny.CLOUDINARY_API_SECRET = "";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(200);
    } finally {
      envAny.APP_ENV = originalAppEnv;
      envAny.TRANSFORMATION_PROVIDER = originalProvider;
      envAny.CLOUDINARY_CLOUD_NAME = originalCloudName;
      envAny.CLOUDINARY_API_KEY = originalApiKey;
      envAny.CLOUDINARY_API_SECRET = originalApiSecret;
    }
  });

  it("never rejects requests outside production, regardless of secret values", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
  });
});
