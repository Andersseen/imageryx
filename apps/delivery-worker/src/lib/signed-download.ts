import { AssetRepository, VariantRepository, type D1Client } from "@imageryx/database";
import { verifySignedToken } from "@imageryx/image-core";
import type { StorageProvider } from "@imageryx/providers";

export interface SignedDownloadDeps {
  db: D1Client;
  storage: StorageProvider;
  signingSecret: string;
}

export interface SignedDownloadTokenPayload extends Record<string, unknown> {
  assetId: string;
  variant: string;
  exp: number;
  nonce: string;
}

export type SignedDownloadOutcome =
  | { kind: "ok"; status: 200; headers: Record<string, string>; body: ReadableStream<Uint8Array> }
  | { kind: "error"; status: 400 | 404 | 410; code: string };

function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\r\n]/g, "_");
  return `attachment; filename="${safe}"`;
}

export async function resolveSignedDownload(
  deps: SignedDownloadDeps,
  token: string,
): Promise<SignedDownloadOutcome> {
  const verified = await verifySignedToken<SignedDownloadTokenPayload>(token, deps.signingSecret);
  if (!verified.valid) return { kind: "error", status: 400, code: "invalid_token" };
  if (verified.expired) return { kind: "error", status: 410, code: "token_expired" };

  const { assetId, variant: variantSelector } = verified.payload;
  const asset = await new AssetRepository(deps.db).findById(assetId);
  if (!asset || asset.deletedAt) return { kind: "error", status: 404, code: "asset_not_found" };

  if (variantSelector === "original") {
    if (!asset.downloadOriginalEnabled) {
      return { kind: "error", status: 404, code: "downloads_disabled" };
    }
    const object = await deps.storage.get(asset.storageKey);
    if (!object) return { kind: "error", status: 404, code: "original_object_missing" };

    return {
      kind: "ok",
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(object.size),
        "Content-Disposition": contentDisposition(asset.originalFilename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
      body: object.body,
    };
  }

  const variant = await new VariantRepository(deps.db).findById(variantSelector);
  if (!variant || variant.assetId !== assetId) {
    return { kind: "error", status: 404, code: "variant_not_found" };
  }
  if (variant.status !== "ready" || !variant.storageKey) {
    return { kind: "error", status: 404, code: "variant_not_ready" };
  }

  const object = await deps.storage.get(variant.storageKey);
  if (!object) return { kind: "error", status: 404, code: "variant_object_missing" };

  return {
    kind: "ok",
    status: 200,
    headers: {
      "Content-Type": variant.mimeType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Content-Disposition": contentDisposition(`${asset.slug}-${variant.id}`),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
    body: object.body,
  };
}
