import { ProjectRepository } from "@imageryx/database";
import { createDecodableImageFixture } from "@imageryx/test-utils";
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getStorageProvider } from "../src/lib/env";
import { authHeaders } from "./helpers";

/**
 * Regression cover for the production-only upload failure: this Worker's
 * storage access used to run the *full* provider parse, which rejects a
 * `TRANSFORMATION_PROVIDER=cloudinary` configuration unless Cloudinary
 * credentials are supplied — credentials `getStorageProvider` never passed
 * and this Worker does not need, because it never transforms anything.
 * Production sets `TRANSFORMATION_PROVIDER=cloudinary` (see
 * wrangler.jsonc), so every upload and every project purge died there as
 * an opaque 500 while every local test passed under `mock`.
 */
describe("getStorageProvider", () => {
  it("builds a storage provider with a cloudinary transformation provider and no cloudinary credentials", () => {
    expect(() =>
      getStorageProvider({
        ...env,
        STORAGE_PROVIDER: "r2",
        TRANSFORMATION_PROVIDER: "cloudinary",
        CLOUDINARY_CLOUD_NAME: undefined,
        CLOUDINARY_API_KEY: undefined,
        CLOUDINARY_API_SECRET: undefined,
      }),
    ).not.toThrow();
  });
});

describe("upload under the production provider configuration", () => {
  it("accepts an upload when TRANSFORMATION_PROVIDER=cloudinary without cloudinary credentials", async () => {
    const project = await new ProjectRepository(env.DB).create({
      name: "Production Config",
      slug: `production-config-${crypto.randomUUID()}`,
    });
    const fixture = createDecodableImageFixture("image/svg+xml");
    const form = new FormData();
    form.set("projectId", project.id);
    form.set(
      "file",
      new File([new Uint8Array(fixture.bytes)], fixture.filename, {
        type: "image/svg+xml",
      }),
    );

    const originalProvider = env.TRANSFORMATION_PROVIDER;
    env.TRANSFORMATION_PROVIDER = "cloudinary";
    try {
      const response = await SELF.fetch(
        "https://example.com/v1/assets/upload",
        { method: "POST", headers: authHeaders(), body: form },
      );
      expect(response.status).toBe(201);
    } finally {
      env.TRANSFORMATION_PROVIDER = originalProvider;
    }
  });
});
