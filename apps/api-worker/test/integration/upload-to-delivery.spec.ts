import { resolveDelivery } from "@imageryx/delivery-worker/resolve-delivery";
import { resolveSignedDownload } from "@imageryx/delivery-worker/signed-download";
import {
  AssetRepository,
  FolderRepository,
  PresetRepository,
  ProjectRepository,
  VariantRepository,
} from "@imageryx/database";
import { createSignedToken } from "@imageryx/image-core";
import { R2StorageProvider } from "@imageryx/providers";
import { runJobUntilSettled } from "@imageryx/processing-worker/jobs";
import { createDecodableImageFixture } from "@imageryx/test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestVariant } from "../../src/services/generate-variant.service";
import { uploadAsset } from "../../src/services/upload-asset.service";
import { createIntegrationEnvironment, type IntegrationEnvironment } from "./environment";

const SIGNING_SECRET = "integration-test-signing-secret";

describe("backend integration: upload -> processing -> variant -> delivery", () => {
  let env: IntegrationEnvironment;

  beforeAll(async () => {
    env = await createIntegrationEnvironment();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it("carries a real upload through metadata inspection, variant generation, delivery, and signed download", async () => {
    const storage = new R2StorageProvider(env.bucket);
    const deps = { db: env.db, storage, maxUploadSizeBytes: 25 * 1024 * 1024 };

    // 1-3: seed a project and a folder through the real repositories.
    const project = await new ProjectRepository(env.db).create({
      name: "Integration Project",
      slug: "integration-project",
    });
    const folder = await new FolderRepository(env.db).create({
      projectId: project.id,
      parentId: null,
      name: "Photos",
      slug: "photos",
      path: "photos",
    });

    // 4-5: upload a real, decodable fixture through the exact same service the HTTP route calls.
    const fixture = createDecodableImageFixture("image/png");
    const uploadResult = await uploadAsset(deps, {
      projectId: project.id,
      folderId: folder.id,
      file: { bytes: fixture.bytes, filename: fixture.filename, mimeType: "image/png" },
      visibility: "public",
      downloadOriginalEnabled: true,
    });

    expect(uploadResult.asset.processingStatus).toBe("pending");
    expect(uploadResult.asset.width).toBeNull();

    // 6-7: run the inspect-metadata job (the same function the real Queue consumer calls) and
    // verify the asset becomes ready with real, non-invented dimensions.
    const processingDeps = { db: env.db, storage, maxAttempts: 3 };
    const inspectOutcome = await runJobUntilSettled(processingDeps, uploadResult.processingJobId);
    expect(inspectOutcome).toEqual({ outcome: "completed" });

    const assets = new AssetRepository(env.db);
    const readyAsset = await assets.findById(uploadResult.asset.id);
    expect(readyAsset?.processingStatus).toBe("ready");
    expect(readyAsset?.width).toBe(fixture.width);
    expect(readyAsset?.height).toBe(fixture.height);

    // 8: request a preset variant.
    const preset = await new PresetRepository(env.db).create({
      projectId: project.id,
      name: "Thumbnail",
      slug: "thumbnail",
      operations: [{ type: "resize", width: 4, height: 4, fit: "cover" }],
      outputFormat: "auto",
      quality: 75,
    });
    const variantRequest = await requestVariant(env.db, {
      assetId: uploadResult.asset.id,
      presetId: preset.id,
      persist: true,
      preferredProvider: "auto",
    });
    expect(variantRequest.status).toBe("created");
    if (variantRequest.status !== "created") throw new Error("unreachable");

    // 9-10: run the generate-variant job and verify the variant becomes ready with real bytes.
    const variantOutcome = await runJobUntilSettled(processingDeps, variantRequest.processingJobId);
    expect(variantOutcome).toEqual({ outcome: "completed" });

    const readyVariant = await new VariantRepository(env.db).findById(variantRequest.variant.id);
    expect(readyVariant?.status).toBe("ready");
    expect(readyVariant?.storageKey).toBeTruthy();

    // 11-13: resolve original and preset delivery through the real Delivery Worker resolver —
    // both must be valid, streamable image responses.
    const deliveryDeps = { db: env.db, storage };
    const originalDelivery = await resolveDelivery(deliveryDeps, {
      projectSlug: project.slug,
      assetPath: readyAsset?.path ?? "",
      presetSlug: null,
      ifNoneMatch: null,
    });
    expect(originalDelivery.kind).toBe("ok");
    if (originalDelivery.kind === "ok") {
      expect(originalDelivery.headers["Content-Type"]).toBe("image/png");
    }

    const presetDelivery = await resolveDelivery(deliveryDeps, {
      projectSlug: project.slug,
      assetPath: readyAsset?.path ?? "",
      presetSlug: preset.slug,
      ifNoneMatch: null,
    });
    expect(presetDelivery.kind).toBe("ok");
    if (presetDelivery.kind === "ok") {
      expect(presetDelivery.headers["X-Imageryx-Simulated"]).toBe("true");
      expect(presetDelivery.headers["Content-Type"]).toBe("image/svg+xml");
    }

    // 14-15: create a signed original-download token and resolve it through the real
    // Delivery Worker signed-download resolver.
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = await createSignedToken(
      { assetId: uploadResult.asset.id, variant: "original", exp, nonce: "integration-test" },
      SIGNING_SECRET,
    );
    const downloadOutcome = await resolveSignedDownload(
      { db: env.db, storage, signingSecret: SIGNING_SECRET },
      token,
    );
    expect(downloadOutcome.kind).toBe("ok");
    if (downloadOutcome.kind === "ok") {
      expect(downloadOutcome.headers["Content-Disposition"]).toContain("attachment");
    }
  });
});
