import {
  assetSchema,
  folderSchema,
  presetSchema,
  processingJobSchema,
  projectSchema,
  supportedImageMimeTypeSchema,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "@imageryx/contracts";
import { detectImageSignature } from "@imageryx/image-core";
import { describe, expect, it } from "vitest";
import { createAssetFixture } from "./asset.fixture";
import { createFolderFixture } from "./folder.fixture";
import { createImageBytesFixture } from "./image-bytes.fixture";
import { createPresetFixture } from "./preset.fixture";
import { createProcessingJobFixture } from "./processing-job.fixture";
import { createProjectFixture } from "./project.fixture";

describe("domain fixture builders", () => {
  it("createProjectFixture produces a schema-valid project", () => {
    expect(projectSchema.safeParse(createProjectFixture()).success).toBe(true);
  });

  it("createFolderFixture produces a schema-valid folder", () => {
    expect(folderSchema.safeParse(createFolderFixture()).success).toBe(true);
  });

  it("createAssetFixture produces a schema-valid asset", () => {
    expect(assetSchema.safeParse(createAssetFixture()).success).toBe(true);
  });

  it("createPresetFixture produces a schema-valid preset", () => {
    expect(presetSchema.safeParse(createPresetFixture()).success).toBe(true);
  });

  it("createProcessingJobFixture produces a schema-valid processing job", () => {
    expect(
      processingJobSchema.safeParse(createProcessingJobFixture()).success,
    ).toBe(true);
  });

  it("fixtures accept overrides without losing schema validity", () => {
    const asset = createAssetFixture({
      visibility: "public",
      mimeType: "image/webp",
      extension: "webp",
    });
    expect(asset.visibility).toBe("public");
    expect(assetSchema.safeParse(asset).success).toBe(true);
  });

  it("fixtures produce distinct IDs across calls", () => {
    expect(createProjectFixture().id).not.toBe(createProjectFixture().id);
  });
});

describe("createImageBytesFixture", () => {
  it.each(
    SUPPORTED_IMAGE_MIME_TYPES.filter(
      (m) =>
        supportedImageMimeTypeSchema.safeParse(m).success &&
        m !== "image/svg+xml",
    ),
  )(
    "produces bytes recognizable as %s by image-core signature detection",
    (mimeType) => {
      const bytes = createImageBytesFixture(mimeType);
      expect(detectImageSignature(bytes).mimeType).toBe(mimeType);
    },
  );

  it("produces SVG bytes recognized as structurally SVG", () => {
    const bytes = createImageBytesFixture("image/svg+xml");
    expect(detectImageSignature(bytes).mimeType).toBe("image/svg+xml");
  });
});
