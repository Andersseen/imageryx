import { describe, expect, it } from "vitest";
import {
  storageProviderNameSchema,
  transformationProviderNameSchema,
} from "./provider.schema";

describe("storageProviderNameSchema", () => {
  it.each(["local", "r2"])("accepts %s", (value) => {
    expect(storageProviderNameSchema.safeParse(value).success).toBe(true);
  });

  it("rejects an unsupported storage provider", () => {
    expect(storageProviderNameSchema.safeParse("s3").success).toBe(false);
  });
});

describe("transformationProviderNameSchema", () => {
  it.each(["mock", "cloudflare", "cloudinary"])("accepts %s", (value) => {
    expect(transformationProviderNameSchema.safeParse(value).success).toBe(
      true,
    );
  });

  it("rejects an unsupported transformation provider", () => {
    expect(transformationProviderNameSchema.safeParse("imgix").success).toBe(
      false,
    );
  });
});
