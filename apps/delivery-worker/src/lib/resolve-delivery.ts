import type { ImageAsset } from "@imageryx/contracts";
import { AssetRepository, PresetRepository, ProjectRepository, VariantRepository, type D1Client } from "@imageryx/database";
import { hashPreset } from "@imageryx/image-core";
import type { StorageProvider } from "@imageryx/providers";
import { withSvgSecurityHeaders } from "./svg-headers";

export interface DeliveryDeps {
  db: D1Client;
  storage: StorageProvider;
}

export type DeliveryOutcome =
  | { kind: "ok"; status: 200; headers: Record<string, string>; body: ReadableStream<Uint8Array> }
  | { kind: "not-modified"; status: 304; headers: Record<string, string> }
  | { kind: "error"; status: 404; code: string };

const ORIGINAL_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
const VARIANT_CACHE_CONTROL = "public, max-age=31536000, immutable";

function notFound(code: string): DeliveryOutcome {
  return { kind: "error", status: 404, code };
}

export interface ResolveDeliveryInput {
  projectSlug: string;
  assetPath: string;
  presetSlug: string | null;
  ifNoneMatch: string | null;
}

/**
 * Resolves and streams a public original or a ready, persisted variant.
 * Private and deleted assets both resolve to the same generic 404 (see
 * SECURITY.md) — this route never distinguishes "exists but private"
 * from "never existed". A requested variant that isn't ready yet is also
 * a 404 rather than blocking on generation — see context.md's "Variant
 * delivery" note for the chosen contract.
 */
export async function resolveDelivery(
  deps: DeliveryDeps,
  input: ResolveDeliveryInput,
): Promise<DeliveryOutcome> {
  const project = await new ProjectRepository(deps.db).findBySlug(input.projectSlug);
  if (!project) return notFound("project_not_found");

  const asset = await new AssetRepository(deps.db).findByPublicPath(project.id, input.assetPath);
  if (!asset) return notFound("asset_not_found");
  if (asset.visibility !== "public") return notFound("asset_not_found");

  if (input.presetSlug === null) {
    return streamOriginal(deps, asset, input.ifNoneMatch);
  }

  const preset = await new PresetRepository(deps.db).findBySlug(project.id, input.presetSlug);
  if (!preset) return notFound("preset_not_found");

  const presetHash = await hashPreset({
    operations: preset.operations,
    outputFormat: preset.outputFormat,
    quality: preset.quality,
  });
  const variant = await new VariantRepository(deps.db).findByAssetAndPresetHash(asset.id, presetHash);
  if (!variant || variant.status !== "ready" || !variant.storageKey) {
    return notFound("variant_not_ready");
  }

  const object = await deps.storage.get(variant.storageKey);
  if (!object) return notFound("variant_object_missing");

  const headers: Record<string, string> = withSvgSecurityHeaders(
    {
      "Content-Type": variant.mimeType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      ETag: `"${variant.checksum}"`,
      "Cache-Control": VARIANT_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
    variant.mimeType,
  );
  if (variant.provider === "mock") {
    headers["X-Imageryx-Simulated"] = "true";
  }

  if (input.ifNoneMatch && input.ifNoneMatch === headers["ETag"]) {
    return { kind: "not-modified", status: 304, headers: pick(headers, ["ETag", "Cache-Control"]) };
  }

  return { kind: "ok", status: 200, headers, body: object.body };
}

async function streamOriginal(
  deps: DeliveryDeps,
  asset: ImageAsset,
  ifNoneMatch: string | null,
): Promise<DeliveryOutcome> {
  const etag = `"${asset.checksum}"`;
  if (ifNoneMatch && ifNoneMatch === etag) {
    return {
      kind: "not-modified",
      status: 304,
      headers: { ETag: etag, "Cache-Control": ORIGINAL_CACHE_CONTROL },
    };
  }

  const object = await deps.storage.get(asset.storageKey);
  if (!object) return notFound("original_object_missing");

  return {
    kind: "ok",
    status: 200,
    headers: withSvgSecurityHeaders(
      {
        "Content-Type": asset.mimeType,
        "Content-Length": String(object.size),
        ETag: etag,
        "Cache-Control": ORIGINAL_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
      asset.mimeType,
    ),
    body: object.body,
  };
}

function pick<T extends Record<string, string>>(source: T, keys: (keyof T)[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) result[key as string] = value;
  }
  return result;
}
