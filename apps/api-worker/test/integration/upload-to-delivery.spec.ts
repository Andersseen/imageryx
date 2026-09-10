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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestVariant } from "../../src/services/generate-variant.service";
import { uploadAsset } from "../../src/services/upload-asset.service";
import {
  createIntegrationEnvironment,
  type IntegrationEnvironment,
} from "./environment";

const SIGNING_SECRET = "integration-test-signing-secret";

/**
 * Reads Cloudinary credentials from the processing-worker's local .dev.vars.
 * The file is git-ignored; if it is missing or incomplete the whole suite is
 * skipped so CI and local dev without secrets stay green.
 */
// `.href` rather than the URL object: this file is typechecked inside api-worker's tsconfig,
// where the ambient `URL` is the Workers/DOM one, while `fileURLToPath` wants `node:url`'s.
// The two are structurally identical until @types/node adds a member to one of them (26.x added
// `Symbol.dispose` to `URLSearchParams` iterators), at which point the object overload stops
// matching and only the string overload still does. Same cross-runtime friction as the other
// cases in context.md's "Technical debt / compatibility workarounds".
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url).href);
const devVarsPath = resolve(repoRoot, "apps", "processing-worker", ".dev.vars");

function parseDevVars(path: string): Record<string, string> {
  try {
    const text = readFileSync(path, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key && rest.length > 0) {
        vars[key] = rest.join("=").trim();
      }
    }
    return vars;
  } catch {
    return {};
  }
}

const devVars = parseDevVars(devVarsPath);
const creds = {
  cloudName: devVars.CLOUDINARY_CLOUD_NAME ?? "",
  apiKey: devVars.CLOUDINARY_API_KEY ?? "",
  apiSecret: devVars.CLOUDINARY_API_SECRET ?? "",
};

const enabled =
  devVars.TRANSFORMATION_PROVIDER === "cloudinary" &&
  creds.cloudName.length > 0 &&
  creds.apiKey.length > 0 &&
  creds.apiSecret.length > 0;

async function destroyCloudinaryAsset(publicId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${creds.apiSecret}`;
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(signatureBase),
  );
  const signature = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", creds.apiKey);
  form.append("signature", signature);

  await fetch(
    `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/destroy`,
    {
      method: "POST",
      body: form,
    },
  );
}

const describeIfEnabled = enabled ? describe : describe.skip;

// Tiny 1x1 red PNG generated inline so the test has no committed binary fixtures.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

describeIfEnabled(
  "backend integration: upload -> Cloudinary -> delivery",
  () => {
    let env: IntegrationEnvironment;

    beforeAll(async () => {
      env = await createIntegrationEnvironment();
    });

    afterAll(async () => {
      await env.teardown();
    });

    it("carries a real upload through metadata inspection, Cloudinary variant generation, delivery, and signed download", async () => {
      const storage = new R2StorageProvider(env.bucket);
      const deps = {
        db: env.db,
        storage,
        maxUploadSizeBytes: 25 * 1024 * 1024,
      };
      const processingDeps = {
        db: env.db,
        storage,
        maxAttempts: 3,
        cloudinary: creds,
        images: null,
      };

      // 1-3: seed a project and a folder through the real repositories.
      const project = await new ProjectRepository(env.db).create({
        name: "Integration Project",
        slug: `integration-project-${Date.now()}`,
      });
      const folder = await new FolderRepository(env.db).create({
        projectId: project.id,
        parentId: null,
        name: "Photos",
        slug: "photos",
        path: "photos",
      });

      // 4-5: upload a tiny but real PNG (1x1 red pixel) that Cloudinary accepts.
      const sourceBytes = decodeBase64(TINY_PNG_BASE64);
      const uploadResult = await uploadAsset(deps, {
        projectId: project.id,
        folderId: folder.id,
        file: {
          bytes: sourceBytes,
          filename: "pixel.png",
          mimeType: "image/png",
        },
        visibility: "public",
        downloadOriginalEnabled: true,
      });

      expect(uploadResult.asset.processingStatus).toBe("pending");
      expect(uploadResult.asset.width).toBeNull();

      // 6-7: run the inspect-metadata job and verify the asset becomes ready.
      const inspectOutcome = await runJobUntilSettled(
        processingDeps,
        uploadResult.processingJobId,
      );
      expect(inspectOutcome).toEqual({ outcome: "completed" });

      const assets = new AssetRepository(env.db);
      const readyAsset = await assets.findById(uploadResult.asset.id);
      expect(readyAsset?.processingStatus).toBe("ready");
      expect(readyAsset?.width).toBe(1);
      expect(readyAsset?.height).toBe(1);

      // 8: request a Cloudinary-generated preset variant.
      const preset = await new PresetRepository(env.db).create({
        projectId: project.id,
        name: "Thumbnail",
        slug: "thumbnail",
        operations: [{ type: "resize", width: 10, height: 10, fit: "cover" }],
        outputFormat: "jpeg",
        quality: 80,
      });
      const variantRequest = await requestVariant(env.db, {
        assetId: uploadResult.asset.id,
        presetId: preset.id,
        persist: true,
        preferredProvider: "auto",
        configuredProvider: "cloudinary",
      });
      expect(variantRequest.status).toBe("created");
      if (variantRequest.status !== "created") throw new Error("unreachable");
      expect(variantRequest.variant.provider).toBe("cloudinary");

      // 9-10: run the generate-variant job and verify the variant becomes ready with real bytes.
      const variantOutcome = await runJobUntilSettled(
        processingDeps,
        variantRequest.processingJobId,
      );
      expect(variantOutcome).toEqual({ outcome: "completed" });

      const readyVariant = await new VariantRepository(env.db).findById(
        variantRequest.variant.id,
      );
      expect(readyVariant?.status).toBe("ready");
      expect(readyVariant?.provider).toBe("cloudinary");
      expect(readyVariant?.storageKey).toBeTruthy();
      expect(readyVariant?.mimeType).toMatch(/^image\//);
      expect(readyVariant?.sizeBytes).toBeGreaterThan(0);
      expect(readyVariant?.width).toBe(10);
      expect(readyVariant?.height).toBe(10);

      // 11-13: resolve original and preset delivery through the real Delivery Worker resolver.
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
        expect(presetDelivery.headers["Content-Type"]).toMatch(/^image\//);
        expect(presetDelivery.headers["X-Imageryx-Simulated"]).toBeUndefined();
        expect(presetDelivery.headers["Content-Length"]).toBe(
          String(readyVariant?.sizeBytes),
        );
      }

      // 14-15: create a signed original-download token and resolve it through the real
      // Delivery Worker signed-download resolver.
      const exp = Math.floor(Date.now() / 1000) + 900;
      const token = await createSignedToken(
        {
          assetId: uploadResult.asset.id,
          variant: "original",
          exp,
          nonce: "integration-test",
        },
        SIGNING_SECRET,
      );
      const downloadOutcome = await resolveSignedDownload(
        { db: env.db, storage, signingSecret: SIGNING_SECRET },
        token,
      );
      expect(downloadOutcome.kind).toBe("ok");
      if (downloadOutcome.kind === "ok") {
        expect(downloadOutcome.headers["Content-Disposition"]).toContain(
          "attachment",
        );
      }

      // Best-effort cleanup of the Cloudinary asset.
      if (readyVariant?.presetHash) {
        await destroyCloudinaryAsset(
          `imageryx/${uploadResult.asset.id}/${readyVariant.presetHash}`,
        );
      }
    }, 60_000);
  },
);

const SAMPLE_UNOPTIMIZED_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <title>Star Icon</title>
  <metadata>Created with Sketch.</metadata>
  <!-- a comment -->
  <script>alert(document.cookie)</script>
  <path d="M12 2 L15 9 L22 9 L17 14 L19 21 L12 17 L5 21 L7 14 L2 9 L9 9 Z" fill="#f5a623" onload="alert(1)" />
</svg>`;

/**
 * Unlike the Cloudinary scenario above, this needs no external credentials
 * — the "builtin" provider is real, local, and deterministic — so it runs
 * unconditionally in every test pass, not gated behind `describeIfEnabled`.
 */
describe("backend integration: upload -> builtin SVG optimization -> delivery", () => {
  let env: IntegrationEnvironment;

  beforeAll(async () => {
    env = await createIntegrationEnvironment();
  });

  afterAll(async () => {
    await env.teardown();
  });

  it("carries a real SVG upload through metadata inspection, local optimization, and delivery — stripping the script/comment/metadata while preserving viewBox and title", async () => {
    const storage = new R2StorageProvider(env.bucket);
    const deps = {
      db: env.db,
      storage,
      maxUploadSizeBytes: 25 * 1024 * 1024,
    };
    const processingDeps = {
      db: env.db,
      storage,
      maxAttempts: 3,
      cloudinary: null,
      images: null,
    };

    const project = await new ProjectRepository(env.db).create({
      name: "SVG Integration Project",
      slug: `svg-integration-project-${Date.now()}`,
    });

    const sourceBytes = new TextEncoder().encode(SAMPLE_UNOPTIMIZED_SVG);
    const uploadResult = await uploadAsset(deps, {
      projectId: project.id,
      folderId: null,
      file: {
        bytes: sourceBytes,
        filename: "star.svg",
        mimeType: "image/svg+xml",
      },
      visibility: "public",
      downloadOriginalEnabled: true,
    });

    expect(uploadResult.asset.processingStatus).toBe("pending");

    const inspectOutcome = await runJobUntilSettled(
      processingDeps,
      uploadResult.processingJobId,
    );
    expect(inspectOutcome).toEqual({ outcome: "completed" });

    const assets = new AssetRepository(env.db);
    const readyAsset = await assets.findById(uploadResult.asset.id);
    expect(readyAsset?.processingStatus).toBe("ready");
    expect(readyAsset?.mimeType).toBe("image/svg+xml");

    const preset = await new PresetRepository(env.db).create({
      projectId: project.id,
      name: "SVG Optimized",
      slug: "svg-optimized",
      operations: [
        { type: "svgOptimize", removeComments: true, removeMetadata: true },
      ],
      outputFormat: "svg",
      quality: null,
    });
    const variantRequest = await requestVariant(env.db, {
      assetId: uploadResult.asset.id,
      presetId: preset.id,
      persist: true,
      preferredProvider: "auto",
      configuredProvider: "cloudinary",
    });
    expect(variantRequest.status).toBe("created");
    if (variantRequest.status !== "created") throw new Error("unreachable");
    // Selected unconditionally by provider-selection's svg -> builtin rule, even though
    // `configuredProvider` above is "cloudinary" — proving the rule really is unconditional.
    expect(variantRequest.variant.provider).toBe("builtin");

    const variantOutcome = await runJobUntilSettled(
      processingDeps,
      variantRequest.processingJobId,
    );
    expect(variantOutcome).toEqual({ outcome: "completed" });

    const readyVariant = await new VariantRepository(env.db).findById(
      variantRequest.variant.id,
    );
    expect(readyVariant?.status).toBe("ready");
    expect(readyVariant?.provider).toBe("builtin");
    expect(readyVariant?.mimeType).toBe("image/svg+xml");
    expect(readyVariant?.storageKey).toBeTruthy();
    expect(readyVariant?.sizeBytes).toBeGreaterThan(0);
    expect(readyVariant?.sizeBytes).toBeLessThan(sourceBytes.byteLength);

    const storedObject = await storage.get(readyVariant?.storageKey ?? "");
    const optimizedBytes = await new Response(storedObject?.body).arrayBuffer();
    const optimizedSvg = new TextDecoder().decode(optimizedBytes);
    expect(optimizedSvg).toContain('viewBox="0 0 24 24"');
    expect(optimizedSvg).toContain("<title>Star Icon</title>");
    expect(optimizedSvg).not.toContain("<script");
    expect(optimizedSvg).not.toContain("onload");
    expect(optimizedSvg).not.toContain("<!--");
    expect(optimizedSvg).not.toContain("<metadata>");

    // Delivery still applies the SVG CSP to the optimized variant — optimization never
    // weakens the existing untrusted-SVG posture (see svg-headers.ts).
    const deliveryDeps = { db: env.db, storage };
    const presetDelivery = await resolveDelivery(deliveryDeps, {
      projectSlug: project.slug,
      assetPath: readyAsset?.path ?? "",
      presetSlug: preset.slug,
      ifNoneMatch: null,
    });
    expect(presetDelivery.kind).toBe("ok");
    if (presetDelivery.kind === "ok") {
      expect(presetDelivery.headers["Content-Type"]).toBe("image/svg+xml");
      expect(presetDelivery.headers["Content-Security-Policy"]).toContain(
        "sandbox",
      );
    }
  }, 30_000);
});
