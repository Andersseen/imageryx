import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("production config validation", () => {
  it("rejects every request when APP_ENV=production and TRANSFORMATION_PROVIDER=cloudinary with missing cloudinary secrets", async () => {
    const originalAppEnv = env.APP_ENV;
    const originalProvider = env.TRANSFORMATION_PROVIDER;
    const originalCloudName = env.CLOUDINARY_CLOUD_NAME;
    const originalApiKey = env.CLOUDINARY_API_KEY;
    const originalApiSecret = env.CLOUDINARY_API_SECRET;
    env.APP_ENV = "production";
    env.TRANSFORMATION_PROVIDER = "cloudinary";
    env.CLOUDINARY_CLOUD_NAME = "";
    env.CLOUDINARY_API_KEY = "";
    env.CLOUDINARY_API_SECRET = "";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(500);
    } finally {
      env.APP_ENV = originalAppEnv;
      env.TRANSFORMATION_PROVIDER = originalProvider;
      env.CLOUDINARY_CLOUD_NAME = originalCloudName;
      env.CLOUDINARY_API_KEY = originalApiKey;
      env.CLOUDINARY_API_SECRET = originalApiSecret;
    }
  });

  it("serves requests normally when APP_ENV=production and cloudinary secrets are set", async () => {
    const originalAppEnv = env.APP_ENV;
    const originalProvider = env.TRANSFORMATION_PROVIDER;
    const originalCloudName = env.CLOUDINARY_CLOUD_NAME;
    const originalApiKey = env.CLOUDINARY_API_KEY;
    const originalApiSecret = env.CLOUDINARY_API_SECRET;
    env.APP_ENV = "production";
    env.TRANSFORMATION_PROVIDER = "cloudinary";
    env.CLOUDINARY_CLOUD_NAME = "real-cloud-name";
    env.CLOUDINARY_API_KEY = "real-api-key";
    env.CLOUDINARY_API_SECRET = "real-api-secret";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(200);
    } finally {
      env.APP_ENV = originalAppEnv;
      env.TRANSFORMATION_PROVIDER = originalProvider;
      env.CLOUDINARY_CLOUD_NAME = originalCloudName;
      env.CLOUDINARY_API_KEY = originalApiKey;
      env.CLOUDINARY_API_SECRET = originalApiSecret;
    }
  });

  it("does not require cloudinary secrets when TRANSFORMATION_PROVIDER=mock", async () => {
    const originalAppEnv = env.APP_ENV;
    const originalProvider = env.TRANSFORMATION_PROVIDER;
    const originalCloudName = env.CLOUDINARY_CLOUD_NAME;
    const originalApiKey = env.CLOUDINARY_API_KEY;
    const originalApiSecret = env.CLOUDINARY_API_SECRET;
    env.APP_ENV = "production";
    env.TRANSFORMATION_PROVIDER = "mock";
    env.CLOUDINARY_CLOUD_NAME = "";
    env.CLOUDINARY_API_KEY = "";
    env.CLOUDINARY_API_SECRET = "";
    try {
      const response = await SELF.fetch("https://example.com/health");
      expect(response.status).toBe(200);
    } finally {
      env.APP_ENV = originalAppEnv;
      env.TRANSFORMATION_PROVIDER = originalProvider;
      env.CLOUDINARY_CLOUD_NAME = originalCloudName;
      env.CLOUDINARY_API_KEY = originalApiKey;
      env.CLOUDINARY_API_SECRET = originalApiSecret;
    }
  });

  it("never rejects requests outside production, regardless of secret values", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
  });
});
