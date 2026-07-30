import { describe, expect, it } from "vitest";
import {
  InvalidProviderConfigError,
  parseProviderConfig,
} from "./provider-config.schema";

describe("parseProviderConfig", () => {
  it("parses valid local + mock configuration", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "local",
      TRANSFORMATION_PROVIDER: "mock",
      LOCAL_STORAGE_PATH: ".local/storage",
    });
    expect(config.storageProvider).toBe("local");
    expect(config.transformationProvider).toBe("mock");
    expect(config.localStoragePath).toBe(".local/storage");
    expect(config.cloudinary).toBeNull();
  });

  it("rejects an unsupported storage provider value", () => {
    expect(() =>
      parseProviderConfig({
        STORAGE_PROVIDER: "s3",
        TRANSFORMATION_PROVIDER: "mock",
      }),
    ).toThrow(InvalidProviderConfigError);
  });

  it("rejects local storage with no LOCAL_STORAGE_PATH", () => {
    expect(() =>
      parseProviderConfig({
        STORAGE_PROVIDER: "local",
        TRANSFORMATION_PROVIDER: "mock",
      }),
    ).toThrow(InvalidProviderConfigError);
  });

  it("requires Cloudinary credentials when TRANSFORMATION_PROVIDER=cloudinary", () => {
    expect(() =>
      parseProviderConfig({
        STORAGE_PROVIDER: "r2",
        TRANSFORMATION_PROVIDER: "cloudinary",
      }),
    ).toThrow(InvalidProviderConfigError);
  });

  it("accepts Cloudinary credentials when fully provided", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "r2",
      TRANSFORMATION_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });
    expect(config.cloudinary).toEqual({
      cloudName: "demo",
      apiKey: "key",
      apiSecret: "secret",
    });
  });

  it("requires Cloudinary credentials when only ADVANCED_TRANSFORMATION_PROVIDER=cloudinary", () => {
    expect(() =>
      parseProviderConfig({
        STORAGE_PROVIDER: "r2",
        TRANSFORMATION_PROVIDER: "cloudflare",
        ADVANCED_TRANSFORMATION_PROVIDER: "cloudinary",
      }),
    ).toThrow(InvalidProviderConfigError);
  });

  it("accepts the future r2 + cloudflare + cloudinary configuration", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "r2",
      TRANSFORMATION_PROVIDER: "cloudflare",
      ADVANCED_TRANSFORMATION_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });
    expect(config.advancedTransformationProvider).toBe("cloudinary");
  });
});
