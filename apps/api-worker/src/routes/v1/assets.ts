import {
  assetNameSchema,
  assetSlugSchema,
  assetVisibilitySchema,
  createDownloadUrlInputSchema,
  createVariantInputSchema,
  moveAssetInputSchema,
  tagSchema,
  type AssetFilter,
  type DeletedState,
  type ImageAsset,
  type ProcessingStatus,
  type SupportedImageExtension,
  type SupportedImageMimeType,
  type TransformationProviderName,
} from "@imageryx/contracts";
import {
  AssetActivityRepository,
  AssetRepository,
  FolderRepository,
  PresetRepository,
  ProcessingJobRepository,
  ProjectRepository,
  TagRepository,
  VariantRepository,
} from "@imageryx/database";
import {
  buildDeliveryPath,
  buildDeliveryUrl,
  createSignedToken,
  generateAssetPath,
} from "@imageryx/image-core";
import { Hono } from "hono";
import { z } from "zod";
import { dispatchProcessingJob } from "../../lib/dispatch-processing";
import { getMaxUploadSizeBytes, getStorageProvider } from "../../lib/env";
import {
  ConflictError,
  NotFoundError,
  ValidationHttpError,
} from "../../lib/errors";
import { buildPaginatedResponse } from "../../lib/pagination";
import { param } from "../../lib/params";
import type { RequestIdVariables } from "../../middleware/request-id";
import { requestVariant } from "../../services/generate-variant.service";
import { uploadAsset } from "../../services/upload-asset.service";

export const assetsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

const SUPPORTED_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
]);
const SUPPORTED_PROCESSING_STATUSES = new Set<string>([
  "pending",
  "processing",
  "ready",
  "failed",
]);
const SUPPORTED_VISIBILITIES = new Set<string>(["public", "private"]);
const SUPPORTED_SORT_FIELDS = new Set<string>([
  "createdAt",
  "updatedAt",
  "name",
  "sizeBytes",
]);
const SUPPORTED_DELETED_STATES = new Set<string>(["active", "deleted", "all"]);

function parseAssetFilter(
  c: { req: { query: (key: string) => string | undefined } },
  projectId: string,
): AssetFilter {
  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(c.req.query("pageSize") ?? "24") || 24),
  );
  const folderIdRaw = c.req.query("folderId");
  const sortFieldRaw = c.req.query("sortField") ?? "createdAt";
  const sortField = SUPPORTED_SORT_FIELDS.has(sortFieldRaw)
    ? (sortFieldRaw as AssetFilter["sortField"])
    : "createdAt";
  const deletedRaw = c.req.query("deleted") ?? "active";
  const deleted = SUPPORTED_DELETED_STATES.has(deletedRaw)
    ? (deletedRaw as DeletedState)
    : "active";
  const mimeTypeRaw = c.req.query("mimeType");
  const visibilityRaw = c.req.query("visibility");
  const processingStatusRaw = c.req.query("processingStatus");

  return {
    projectId,
    folderId:
      folderIdRaw === undefined
        ? undefined
        : folderIdRaw === ""
          ? null
          : folderIdRaw,
    tag: c.req.query("tag") || undefined,
    mimeType:
      mimeTypeRaw && SUPPORTED_MIME_TYPES.has(mimeTypeRaw)
        ? (mimeTypeRaw as SupportedImageMimeType)
        : undefined,
    extension:
      (c.req.query("extension") as SupportedImageExtension | undefined) ||
      undefined,
    visibility:
      visibilityRaw && SUPPORTED_VISIBILITIES.has(visibilityRaw)
        ? (visibilityRaw as "public" | "private")
        : undefined,
    processingStatus:
      processingStatusRaw &&
      SUPPORTED_PROCESSING_STATUSES.has(processingStatusRaw)
        ? (processingStatusRaw as ProcessingStatus)
        : undefined,
    search: c.req.query("search")?.trim() || undefined,
    minWidth: numberOrUndefined(c.req.query("minWidth")),
    maxWidth: numberOrUndefined(c.req.query("maxWidth")),
    minHeight: numberOrUndefined(c.req.query("minHeight")),
    maxHeight: numberOrUndefined(c.req.query("maxHeight")),
    deleted,
    createdAfter: c.req.query("createdAfter") || undefined,
    createdBefore: c.req.query("createdBefore") || undefined,
    sortField,
    sortDirection: c.req.query("sortDirection") === "asc" ? "asc" : "desc",
    page,
    pageSize,
  };
}

function numberOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

assetsRoute.post("/upload", async (c) => {
  const maxUploadSizeBytes = getMaxUploadSizeBytes(c.env);
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > 0 && contentLength > maxUploadSizeBytes * 1.5) {
    // *1.5 accounts for multipart boundary/header overhead around the file part — an early,
    // cheap rejection before parsing; the exact byte-length check below is authoritative.
    throw new ValidationHttpError(
      `Request body exceeds the maximum upload size of ${Math.round(maxUploadSizeBytes / (1024 * 1024))}MB.`,
    );
  }

  const body = await c.req.parseBody({ all: true });
  const file = body["file"];
  if (!(file instanceof File)) {
    throw new ValidationHttpError(
      'A "file" field containing the image is required.',
    );
  }
  const projectId = body["projectId"];
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new ValidationHttpError('A "projectId" field is required.');
  }
  const folderIdRaw = body["folderId"];
  const folderId =
    typeof folderIdRaw === "string" && folderIdRaw.length > 0
      ? folderIdRaw
      : null;
  const nameRaw = body["name"];
  const name =
    typeof nameRaw === "string" && nameRaw.length > 0 ? nameRaw : undefined;
  const tagsRaw = body["tags"];
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((t): t is string => typeof t === "string")
    : typeof tagsRaw === "string" && tagsRaw.length > 0
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
  const visibilityRaw = body["visibility"];
  const visibility =
    visibilityRaw === "public" || visibilityRaw === "private"
      ? visibilityRaw
      : undefined;
  const downloadOriginalEnabled = body["downloadOriginalEnabled"] === "true";

  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await uploadAsset(
    { db: c.env.DB, storage: getStorageProvider(c.env), maxUploadSizeBytes },
    {
      projectId,
      folderId,
      file: {
        bytes,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      },
      name,
      tags,
      visibility,
      downloadOriginalEnabled,
    },
  );

  const dispatch = await dispatchProcessingJob(
    c.env,
    c.executionCtx.waitUntil.bind(c.executionCtx),
    result.processingJobId,
  );

  return c.json(
    {
      asset: result.asset,
      processingJobId: result.processingJobId,
      processingDispatch: dispatch,
      duplicateCandidates: result.duplicateCandidates,
      securityWarnings: result.securityWarnings,
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

assetsRoute.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId)
    throw new ValidationHttpError("projectId is a required query parameter.");

  const filter = parseAssetFilter(c, projectId);
  const assets = new AssetRepository(c.env.DB);
  const [items, total] = await Promise.all([
    assets.list(filter),
    assets.count(filter),
  ]);

  const ids = items.map((asset) => asset.id);
  const variants = new VariantRepository(c.env.DB);
  const [tagsByAsset, readyVariantsByAsset, readyPresetSlugsByAsset, folders] =
    await Promise.all([
      new TagRepository(c.env.DB).listForAssets(ids),
      variants.countReadyByAssetIds(ids),
      variants.listReadyPresetSlugsByAssetIds(ids),
      new FolderRepository(c.env.DB).listByIds([
        ...new Set(
          items
            .map((asset) => asset.folderId)
            .filter((id): id is string => id !== null),
        ),
      ]),
    ]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const enriched = items.map((asset) => ({
    ...asset,
    tags: (tagsByAsset.get(asset.id) ?? []).map((tag) => tag.name),
    readyVariantCount: readyVariantsByAsset.get(asset.id) ?? 0,
    // Which preset delivery URLs actually resolve today — lets a grid render a real
    // thumbnail only when one exists, instead of firing a speculative 404 per tile.
    readyPresetSlugs: readyPresetSlugsByAsset.get(asset.id) ?? [],
    folder: asset.folderId
      ? (() => {
          const folder = folderById.get(asset.folderId as string);
          return folder
            ? { id: folder.id, name: folder.name, path: folder.path }
            : null;
        })()
      : null,
  }));

  return c.json(
    buildPaginatedResponse(enriched, filter.page, filter.pageSize, total),
  );
});

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

assetsRoute.get("/:assetId", async (c) => {
  const assetId = param(c, "assetId");
  const asset = await new AssetRepository(c.env.DB).findById(assetId);
  if (!asset) throw new NotFoundError("asset");

  const [project, folder, tags, presets, variants, jobs, activity, duplicates] =
    await Promise.all([
      new ProjectRepository(c.env.DB).findById(asset.projectId),
      asset.folderId
        ? new FolderRepository(c.env.DB).findById(asset.folderId)
        : Promise.resolve(null),
      new TagRepository(c.env.DB).listAssetTags(asset.id),
      new PresetRepository(c.env.DB).listByProject(asset.projectId),
      new VariantRepository(c.env.DB).listByAsset(asset.id),
      new ProcessingJobRepository(c.env.DB).list({
        projectId: asset.projectId,
        assetId: asset.id,
      }),
      new AssetActivityRepository(c.env.DB).listByAsset(asset.id),
      new AssetRepository(c.env.DB).listByChecksum(
        asset.projectId,
        asset.checksum,
      ),
    ]);

  return c.json({
    ...asset,
    tags: tags.map((tag) => tag.name),
    project: project
      ? { id: project.id, name: project.name, slug: project.slug }
      : null,
    folder: folder
      ? { id: folder.id, name: folder.name, path: folder.path }
      : null,
    presets: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      slug: preset.slug,
    })),
    variants,
    processingJobs: jobs,
    activity,
    delivery: buildDeliveryInfo(c.env, project?.slug ?? "", asset),
    duplicateCandidates: duplicates
      .filter((duplicate) => duplicate.id !== asset.id)
      .map((duplicate) => ({ assetId: duplicate.id, path: duplicate.path })),
  });
});

function buildDeliveryInfo(env: Env, projectSlug: string, asset: ImageAsset) {
  if (!projectSlug) return null;
  return {
    originalUrl: buildDeliveryUrl(env.DELIVERY_URL, projectSlug, asset.path),
    originalPath: buildDeliveryPath(projectSlug, asset.path),
  };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const updateAssetBodySchema = z
  .object({
    name: assetNameSchema.optional(),
    slug: assetSlugSchema.optional(),
    visibility: assetVisibilitySchema.optional(),
    downloadOriginalEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "at least one updatable field must be provided",
  });

assetsRoute.patch("/:assetId", async (c) => {
  const assetId = param(c, "assetId");
  const body = updateAssetBodySchema.parse(await c.req.json());

  const assets = new AssetRepository(c.env.DB);
  const existing = await assets.findById(assetId);
  if (!existing) throw new NotFoundError("asset");
  if (existing.deletedAt)
    throw new ConflictError("asset_deleted", "This asset has been deleted.");

  let nextSlug = existing.slug;
  let nextPath = existing.path;
  if (body.slug && body.slug !== existing.slug) {
    const folderPath = existing.path.includes("/")
      ? existing.path.slice(0, existing.path.lastIndexOf("/"))
      : "";
    nextPath = generateAssetPath(folderPath, body.slug);
    const conflict = await assets.findByPublicPath(
      existing.projectId,
      nextPath,
    );
    if (conflict && conflict.id !== existing.id) {
      throw new ConflictError(
        "duplicate_asset_path",
        `An asset already exists at path "${nextPath}".`,
      );
    }
    nextSlug = body.slug;
  }

  const updated = await assets.update(assetId, {
    name: body.name,
    slug: nextSlug,
    path: nextPath,
    visibility: body.visibility,
    downloadOriginalEnabled: body.downloadOriginalEnabled,
  });

  await new AssetActivityRepository(c.env.DB).record({
    assetId,
    projectId: existing.projectId,
    event: "asset.updated",
    metadata: { fields: Object.keys(body) },
  });

  return c.json(updated);
});

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

assetsRoute.post("/:assetId/move", async (c) => {
  const assetId = param(c, "assetId");
  const body = moveAssetInputSchema.parse({
    ...(await c.req.json()),
    id: assetId,
  });

  const assets = new AssetRepository(c.env.DB);
  const existing = await assets.findById(assetId);
  if (!existing) throw new NotFoundError("asset");
  if (existing.deletedAt)
    throw new ConflictError("asset_deleted", "This asset has been deleted.");

  let folder = null;
  if (body.folderId) {
    folder = await new FolderRepository(c.env.DB).findById(body.folderId);
    if (!folder || folder.projectId !== existing.projectId) {
      throw new ValidationHttpError(
        "folderId must reference a folder within the asset's own project.",
      );
    }
  }

  const nextPath = generateAssetPath(folder ? folder.path : "", existing.slug);
  const conflict = await assets.findByPublicPath(existing.projectId, nextPath);
  if (conflict && conflict.id !== existing.id) {
    throw new ConflictError(
      "duplicate_asset_path",
      `An asset already exists at path "${nextPath}".`,
    );
  }

  const updated = await assets.update(assetId, {
    folderId: body.folderId,
    path: nextPath,
  });

  await new AssetActivityRepository(c.env.DB).record({
    assetId,
    projectId: existing.projectId,
    event: "asset.moved",
    metadata: { fromFolderId: existing.folderId, toFolderId: body.folderId },
  });

  return c.json(updated);
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const replaceTagsBodySchema = z.object({ tags: z.array(tagSchema).max(50) });

assetsRoute.put("/:assetId/tags", async (c) => {
  const assetId = param(c, "assetId");
  const body = replaceTagsBodySchema.parse(await c.req.json());

  const assets = new AssetRepository(c.env.DB);
  const existing = await assets.findById(assetId);
  if (!existing) throw new NotFoundError("asset");

  const tagsRepo = new TagRepository(c.env.DB);
  const tagIds = await Promise.all(
    body.tags.map(
      async (name) =>
        (await tagsRepo.findOrCreate(existing.projectId, name)).id,
    ),
  );
  await tagsRepo.setAssetTags(assetId, tagIds);

  await new AssetActivityRepository(c.env.DB).record({
    assetId,
    projectId: existing.projectId,
    event: "asset.tags_changed",
    metadata: { tags: body.tags },
  });

  const updatedTags = await tagsRepo.listAssetTags(assetId);
  return c.json({ tags: updatedTags.map((tag) => tag.name) });
});

// ---------------------------------------------------------------------------
// Activity / Variants
// ---------------------------------------------------------------------------

assetsRoute.get("/:assetId/activity", async (c) => {
  const assetId = param(c, "assetId");
  const existing = await new AssetRepository(c.env.DB).findById(assetId);
  if (!existing) throw new NotFoundError("asset");

  const activity = await new AssetActivityRepository(c.env.DB).listByAsset(
    assetId,
  );
  return c.json({ items: activity });
});

assetsRoute.get("/:assetId/variants", async (c) => {
  const assetId = param(c, "assetId");
  const existing = await new AssetRepository(c.env.DB).findById(assetId);
  if (!existing) throw new NotFoundError("asset");

  const variants = await new VariantRepository(c.env.DB).listByAsset(assetId);
  return c.json({ items: variants });
});

// ---------------------------------------------------------------------------
// Delivery info
// ---------------------------------------------------------------------------

assetsRoute.get("/:assetId/delivery", async (c) => {
  const assetId = param(c, "assetId");
  const asset = await new AssetRepository(c.env.DB).findById(assetId);
  if (!asset) throw new NotFoundError("asset");

  const project = await new ProjectRepository(c.env.DB).findById(
    asset.projectId,
  );
  if (!project) throw new NotFoundError("project");

  const presets = await new PresetRepository(c.env.DB).listByProject(
    asset.projectId,
  );
  const variants = await new VariantRepository(c.env.DB).listByAsset(asset.id);
  const readyPresetIds = new Set(
    variants.filter((v) => v.status === "ready").map((v) => v.presetId),
  );

  return c.json({
    visibility: asset.visibility,
    originalUrl: buildDeliveryUrl(c.env.DELIVERY_URL, project.slug, asset.path),
    presets: presets.map((preset) => ({
      id: preset.id,
      slug: preset.slug,
      name: preset.name,
      ready: readyPresetIds.has(preset.id),
      url: buildDeliveryUrl(
        c.env.DELIVERY_URL,
        project.slug,
        asset.path,
        preset.slug,
      ),
    })),
  });
});

// ---------------------------------------------------------------------------
// Signed download URL
// ---------------------------------------------------------------------------

assetsRoute.post("/:assetId/download-url", async (c) => {
  const assetId = param(c, "assetId");
  const body = createDownloadUrlInputSchema.parse({
    ...(await c.req.json().catch(() => ({}))),
    id: assetId,
  });

  const asset = await new AssetRepository(c.env.DB).findById(assetId);
  if (!asset) throw new NotFoundError("asset");
  if (asset.deletedAt)
    throw new ConflictError("asset_deleted", "This asset has been deleted.");

  if (body.variant === "original") {
    if (!asset.downloadOriginalEnabled) {
      throw new ConflictError(
        "downloads_disabled",
        "Original downloads are disabled for this asset.",
      );
    }
  } else {
    const variant = await new VariantRepository(c.env.DB).findById(
      body.variant,
    );
    if (!variant || variant.assetId !== assetId)
      throw new NotFoundError("variant");
    if (variant.status !== "ready") {
      throw new ConflictError(
        "variant_not_ready",
        "This variant is not ready for download yet.",
      );
    }
  }

  const expiresAt = Math.floor(Date.now() / 1000) + body.expiresIn;
  const token = await createSignedToken(
    {
      assetId,
      variant: body.variant,
      exp: expiresAt,
      nonce: crypto.randomUUID(),
    },
    c.env.DOWNLOAD_SIGNING_SECRET,
  );

  await new AssetActivityRepository(c.env.DB).record({
    assetId,
    projectId: asset.projectId,
    event: "download.url_created",
    metadata: { variant: body.variant },
  });

  return c.json({
    url: `${c.env.DELIVERY_URL.replace(/\/+$/, "")}/download/${token}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    variant: body.variant,
  });
});

// ---------------------------------------------------------------------------
// Variant generation
// ---------------------------------------------------------------------------

assetsRoute.post("/:assetId/variants", async (c) => {
  const assetId = param(c, "assetId");
  const body = createVariantInputSchema.parse({
    ...(await c.req.json()),
    assetId,
  });

  const asset = await new AssetRepository(c.env.DB).findById(assetId);
  if (!asset) throw new NotFoundError("asset");

  const outcome = await requestVariant(c.env.DB, {
    assetId,
    presetId: body.presetId,
    persist: body.persist,
    preferredProvider: body.preferredProvider,
    configuredProvider: c.env.TRANSFORMATION_PROVIDER as TransformationProviderName,
  });

  if (outcome.status === "created") {
    await dispatchProcessingJob(
      c.env,
      c.executionCtx.waitUntil.bind(c.executionCtx),
      outcome.processingJobId,
    );
    await new AssetActivityRepository(c.env.DB).record({
      assetId,
      projectId: asset.projectId,
      event: "variant.requested",
      metadata: { variantId: outcome.variant.id, presetId: body.presetId },
    });
    return c.json(
      {
        variant: outcome.variant,
        processingJobId: outcome.processingJobId,
        status: "created",
      },
      202,
    );
  }

  if (outcome.status === "ready") {
    return c.json(
      { variant: outcome.variant, processingJobId: null, status: "ready" },
      200,
    );
  }

  return c.json(
    {
      variant: outcome.variant,
      processingJobId: outcome.processingJobId,
      status: outcome.status,
    },
    202,
  );
});

// ---------------------------------------------------------------------------
// Soft delete / restore
// ---------------------------------------------------------------------------

assetsRoute.delete("/:assetId", async (c) => {
  const assetId = param(c, "assetId");
  const assets = new AssetRepository(c.env.DB);
  const existing = await assets.findById(assetId);
  if (!existing) throw new NotFoundError("asset");
  if (existing.deletedAt)
    throw new ConflictError(
      "asset_already_deleted",
      "This asset is already deleted.",
    );

  await assets.softDelete(assetId);
  await new AssetActivityRepository(c.env.DB).record({
    assetId,
    projectId: existing.projectId,
    event: "asset.deleted",
  });

  return c.body(null, 204);
});

assetsRoute.post("/:assetId/restore", async (c) => {
  const assetId = param(c, "assetId");
  const assets = new AssetRepository(c.env.DB);
  const existing = await assets.findById(assetId);
  if (!existing) throw new NotFoundError("asset");
  if (!existing.deletedAt)
    throw new ConflictError("asset_not_deleted", "This asset is not deleted.");

  const project = await new ProjectRepository(c.env.DB).findById(
    existing.projectId,
  );
  if (!project) {
    throw new ConflictError(
      "project_missing",
      "The asset's project no longer exists.",
    );
  }
  if (existing.folderId) {
    const folder = await new FolderRepository(c.env.DB).findById(
      existing.folderId,
    );
    if (!folder) {
      // Documented fallback: restore to the project root rather than blocking restore entirely.
      await assets.update(assetId, { folderId: null });
    }
  }

  const conflict = await assets.findByPublicPath(
    existing.projectId,
    existing.path,
  );
  if (conflict && conflict.id !== existing.id) {
    throw new ConflictError(
      "restore_path_conflict",
      `Cannot restore: another active asset already exists at path "${existing.path}". Update its path first.`,
    );
  }

  await assets.restore(assetId);
  await new AssetActivityRepository(c.env.DB).record({
    assetId,
    projectId: existing.projectId,
    event: "asset.restored",
  });

  const restored = await assets.findById(assetId);
  return c.json(restored);
});
