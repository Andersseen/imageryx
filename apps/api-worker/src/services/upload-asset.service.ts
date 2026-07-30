import type { AssetVisibility, ImageAsset, SupportedImageExtension } from "@imageryx/contracts";
import {
  AssetPersistenceService,
  AssetRepository,
  FolderRepository,
  ProcessingJobRepository,
  ProjectRepository,
  TagRepository,
  type D1Client,
} from "@imageryx/database";
import {
  buildOriginalStorageKey,
  computeSha256Checksum,
  generateAssetPath,
  normalizeFilename,
  validateImageAsset,
} from "@imageryx/image-core";
import type { StorageProvider } from "@imageryx/providers";
import { NotFoundError, PayloadTooLargeError, UnsupportedMediaTypeError, ValidationHttpError } from "../lib/errors";

export interface UploadAssetFile {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface UploadAssetInput {
  projectId: string;
  folderId?: string | null;
  file: UploadAssetFile;
  name?: string;
  tags?: string[];
  visibility?: AssetVisibility;
  downloadOriginalEnabled?: boolean;
}

export interface UploadAssetDeps {
  db: D1Client;
  storage: StorageProvider;
  maxUploadSizeBytes: number;
}

export interface UploadAssetResult {
  asset: ImageAsset;
  processingJobId: string;
  duplicateCandidates: { assetId: string; path: string }[];
  securityWarnings: string[];
}

const MAX_PATH_SUFFIX_ATTEMPTS = 1000;

function extractRawExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * The full upload pipeline (steps 4-21 of the phase spec's "Upload
 * validation flow" — steps 1-3 are Worker-level concerns: auth, body-size
 * limits, and multipart parsing, all handled by the caller before this
 * function ever sees bytes). A pure, dependency-injected function, not a
 * Hono route handler, so it is also the exact function the backend
 * integration test calls directly against real Miniflare-backed D1 + R2 —
 * see context.md's "Upload consistency" note for the guarantees below.
 */
export async function uploadAsset(
  deps: UploadAssetDeps,
  input: UploadAssetInput,
): Promise<UploadAssetResult> {
  const projects = new ProjectRepository(deps.db);
  const project = await projects.findById(input.projectId);
  if (!project) throw new NotFoundError("project");

  let folder = null;
  if (input.folderId) {
    folder = await new FolderRepository(deps.db).findById(input.folderId);
    if (!folder || folder.projectId !== input.projectId) {
      throw new ValidationHttpError("folderId does not reference a folder in this project.");
    }
  }

  if (input.file.bytes.byteLength > deps.maxUploadSizeBytes) {
    throw new PayloadTooLargeError(
      `The uploaded file exceeds the maximum upload size of ${Math.round(deps.maxUploadSizeBytes / (1024 * 1024))}MB.`,
    );
  }
  if (input.file.bytes.byteLength === 0) {
    throw new ValidationHttpError("The uploaded file is empty.");
  }

  const rawExtension = extractRawExtension(input.file.filename);
  const validation = validateImageAsset({
    claimedMimeType: input.file.mimeType,
    claimedExtension: rawExtension,
    bytes: input.file.bytes,
  });
  if (!validation.valid || !validation.detectedMimeType || !validation.detectedExtension) {
    throw new UnsupportedMediaTypeError(
      "The uploaded file failed MIME type, extension, or signature validation.",
      { securityWarnings: validation.securityWarnings },
    );
  }

  const extension: SupportedImageExtension = validation.detectedExtension;
  const mimeType = validation.detectedMimeType;

  const normalized = normalizeFilename(input.file.filename, extension);
  const assetName = input.name?.trim() || normalized.base;
  const baseSlug = normalized.base;

  const checksum = await computeSha256Checksum(input.file.bytes);
  const assets = new AssetRepository(deps.db);
  const duplicateAssets = await assets.listByChecksum(input.projectId, checksum);

  const folderPath = folder ? folder.path : "";
  let candidateSlug = baseSlug;
  let path = generateAssetPath(folderPath, candidateSlug);
  for (let attempt = 0; await assets.findByPublicPath(input.projectId, path); attempt++) {
    if (attempt >= MAX_PATH_SUFFIX_ATTEMPTS) {
      throw new ValidationHttpError("Could not find a free logical path for this asset.");
    }
    candidateSlug = `${baseSlug}-${attempt + 1}`;
    path = generateAssetPath(folderPath, candidateSlug);
  }

  const assetId = crypto.randomUUID();
  const storageKey = buildOriginalStorageKey(input.projectId, assetId, extension);

  await deps.storage.put({ key: storageKey, body: input.file.bytes, contentType: mimeType });

  const persistence = new AssetPersistenceService(deps.db);
  let asset: ImageAsset;
  try {
    asset = await persistence.createAssetWithActivity(
      {
        projectId: input.projectId,
        folderId: folder?.id ?? null,
        name: assetName,
        slug: candidateSlug,
        path,
        storageKey,
        originalFilename: input.file.filename.slice(0, 255),
        mimeType,
        extension,
        sizeBytes: input.file.bytes.byteLength,
        checksum,
        visibility: input.visibility ?? "private",
        processingStatus: "pending",
        downloadOriginalEnabled: input.downloadOriginalEnabled ?? false,
      },
      { id: assetId, event: "asset.uploaded", metadata: { originalFilename: input.file.filename } },
    );
  } catch (error) {
    // Storage write succeeded but the metadata row didn't — clean up the orphaned object rather
    // than leaving unreferenced bytes behind. A cleanup failure is logged separately and never
    // masks the original error (see context.md's "Upload consistency" note).
    try {
      await deps.storage.delete(storageKey);
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          event: "upload.storage_cleanup_failed",
          storageKey,
          error: cleanupError instanceof Error ? cleanupError.message : "unknown error",
        }),
      );
    }
    throw error;
  }

  if (input.tags && input.tags.length > 0) {
    const tags = new TagRepository(deps.db);
    const tagIds = await Promise.all(
      input.tags.map(async (name) => (await tags.findOrCreate(input.projectId, name)).id),
    );
    await tags.setAssetTags(asset.id, tagIds);
  }

  const job = await new ProcessingJobRepository(deps.db).create({
    projectId: input.projectId,
    assetId: asset.id,
    type: "inspect-metadata",
    input: { type: "inspect-metadata", assetId: asset.id },
  });

  return {
    asset,
    processingJobId: job.id,
    duplicateCandidates: duplicateAssets.map((duplicate) => ({
      assetId: duplicate.id,
      path: duplicate.path,
    })),
    securityWarnings: validation.securityWarnings,
  };
}
