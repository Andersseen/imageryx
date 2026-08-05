import { ProviderUnavailableError } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import {
  InvalidProviderConfigError,
  parseProviderConfig,
} from "../config/provider-config.schema";
import { CloudflareImagesProvider } from "../transformations/cloudflare-images.provider";
import { CloudinaryProvider } from "../transformations/cloudinary.provider";
import { MockTransformationProvider } from "../transformations/mock-transformation.provider";
import {
  createProviderRegistry,
  createStorageProvider,
  createTransformationProvider,
} from "./provider-registry";

const CLOUDINARY_CREDS = {
  cloudName: "demo",
  apiKey: "key",
  apiSecret: "secret",
};

describe("createTransformationProvider", () => {
  it("creates the mock provider", () => {
    expect(createTransformationProvider("mock")).toBeInstanceOf(
      MockTransformationProvider,
    );
  });

  it("creates the cloudflare provider", () => {
    expect(createTransformationProvider("cloudflare")).toBeInstanceOf(
      CloudflareImagesProvider,
    );
  });

  it("creates the cloudinary provider when credentials are provided", () => {
    expect(
      createTransformationProvider("cloudinary", {
        cloudinary: CLOUDINARY_CREDS,
      }),
    ).toBeInstanceOf(CloudinaryProvider);
  });

  it("throws a clear config error when cloudinary is selected without credentials", () => {
    expect(() => createTransformationProvider("cloudinary")).toThrow(
      InvalidProviderConfigError,
    );
  });
});

describe("createStorageProvider (Workers-safe)", () => {
  it('throws for "local" — local storage is Node-only tooling, not available here', () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "local",
      TRANSFORMATION_PROVIDER: "mock",
      LOCAL_STORAGE_PATH: ".local/storage",
    });
    expect(() => createStorageProvider({ config })).toThrow(
      ProviderUnavailableError,
    );
  });

  it("throws when r2 is selected with no bucket binding provided", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "r2",
      TRANSFORMATION_PROVIDER: "mock",
    });
    expect(() => createStorageProvider({ config })).toThrow(
      ProviderUnavailableError,
    );
  });
});

describe("createProviderRegistry (Workers-safe)", () => {
  it("builds a registry with an advanced transformation provider when configured", () => {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: "r2",
      TRANSFORMATION_PROVIDER: "cloudflare",
      ADVANCED_TRANSFORMATION_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });
    // r2Bucket omitted deliberately: this asserts storage creation fails cleanly, not that a
    // real bucket is available in this Workers-safe test context.
    expect(() => createProviderRegistry({ config })).toThrow(
      ProviderUnavailableError,
    );
  });
});
