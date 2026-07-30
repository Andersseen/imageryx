import {
  createPresetInputSchema,
  outputImageFormatSchema,
  presetOperationsSchema,
  previewPresetInputSchema,
  updatePresetInputSchema,
} from "@imageryx/contracts";
import {
  PresetPersistenceService,
  PresetRepository,
  ProjectRepository,
  SystemPresetDeletionError,
} from "@imageryx/database";
import {
  buildColorPlaceholderDataUri,
  hashPreset,
  renderSimulatedVariantSvg,
  utf8ToBase64,
  validatePresetSemantics,
} from "@imageryx/image-core";
import { MockTransformationProvider } from "@imageryx/providers";
import { Hono } from "hono";
import { ConflictError, NotFoundError, ValidationHttpError } from "../../lib/errors";
import { hasJobsDependingOnPreset } from "../../lib/preset-dependents";
import { logActivity } from "../../lib/log-activity";
import { slugify } from "../../lib/slugify";
import type { RequestIdVariables } from "../../middleware/request-id";

export const presetsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

presetsRoute.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId) {
    throw new ValidationHttpError("projectId is a required query parameter.");
  }

  let items = await new PresetRepository(c.env.DB).listByProject(projectId);

  const systemOnly = c.req.query("system");
  if (systemOnly === "true") items = items.filter((preset) => preset.isSystem);
  if (systemOnly === "false") items = items.filter((preset) => !preset.isSystem);

  const outputFormat = outputImageFormatSchema.safeParse(c.req.query("outputFormat"));
  if (outputFormat.success) {
    items = items.filter((preset) => preset.outputFormat === outputFormat.data);
  }

  const search = c.req.query("search")?.trim().toLowerCase();
  if (search) {
    items = items.filter(
      (preset) =>
        preset.name.toLowerCase().includes(search) || preset.slug.toLowerCase().includes(search),
    );
  }

  return c.json({ items });
});

presetsRoute.post("/", async (c) => {
  const body = createPresetInputSchema.parse(await c.req.json());

  const project = await new ProjectRepository(c.env.DB).findById(body.projectId);
  if (!project) throw new NotFoundError("project");

  validatePresetSemantics({
    operations: body.operations,
    outputFormat: body.outputFormat,
    quality: body.quality ?? null,
  });

  const presets = new PresetRepository(c.env.DB);
  const slug = body.slug ?? slugify(body.name);
  const existingSlug = await presets.findBySlug(body.projectId, slug);
  if (existingSlug) {
    throw new ConflictError(
      "duplicate_preset_slug",
      `A preset with slug "${slug}" already exists in this project.`,
    );
  }

  const candidateHash = await hashPreset({
    operations: body.operations,
    outputFormat: body.outputFormat,
    quality: body.quality ?? null,
  });
  const projectPresets = await presets.listByProject(body.projectId);
  const equivalentHashes = await Promise.all(
    projectPresets.map(async (preset) => ({
      preset,
      hash: await hashPreset({
        operations: preset.operations,
        outputFormat: preset.outputFormat,
        quality: preset.quality,
      }),
    })),
  );
  const equivalent = equivalentHashes.find((entry) => entry.hash === candidateHash);
  if (equivalent) {
    throw new ConflictError(
      "equivalent_preset_exists",
      `An equivalent preset already exists: "${equivalent.preset.name}" (${equivalent.preset.slug}).`,
      { presetId: equivalent.preset.id, slug: equivalent.preset.slug },
    );
  }

  const preset = await new PresetPersistenceService(c.env.DB).createPreset({
    projectId: body.projectId,
    name: body.name,
    slug,
    description: body.description ?? null,
    operations: body.operations,
    outputFormat: body.outputFormat,
    quality: body.quality ?? null,
    isSystem: false,
  });

  logActivity(c, "preset.created", { projectId: body.projectId, presetId: preset.id });

  return c.json(preset, 201);
});

presetsRoute.get("/:presetId", async (c) => {
  const preset = await new PresetRepository(c.env.DB).findById(c.req.param("presetId"));
  if (!preset) throw new NotFoundError("preset");
  return c.json(preset);
});

presetsRoute.patch("/:presetId", async (c) => {
  const presetId = c.req.param("presetId");
  const body = updatePresetInputSchema.parse({ ...(await c.req.json()), id: presetId });

  const presets = new PresetRepository(c.env.DB);
  const existing = await presets.findById(presetId);
  if (!existing) throw new NotFoundError("preset");

  const nextOperations = body.operations ?? existing.operations;
  const nextOutputFormat = body.outputFormat ?? existing.outputFormat;
  const nextQuality = body.quality !== undefined ? body.quality : existing.quality;

  validatePresetSemantics({
    operations: presetOperationsSchema.parse(nextOperations),
    outputFormat: nextOutputFormat,
    quality: nextQuality,
  });

  // Changing operations never mutates already-generated variants' identity: variants key off the
  // *previous* preset hash, which this update does not touch or invalidate — see context.md's
  // "Preset update" note. Only new variant requests use the newly-computed hash.
  const updated = await presets.update(presetId, {
    name: body.name,
    description: body.description,
    operations: body.operations,
    outputFormat: body.outputFormat,
    quality: body.quality,
  });
  logActivity(c, "preset.updated", { presetId, fields: Object.keys(body).filter((k) => k !== "id") });

  return c.json(updated);
});

presetsRoute.delete("/:presetId", async (c) => {
  const presetId = c.req.param("presetId");
  const presets = new PresetRepository(c.env.DB);
  const existing = await presets.findById(presetId);
  if (!existing) throw new NotFoundError("preset");

  const pendingJobs = await hasJobsDependingOnPreset(c.env.DB, presetId);
  if (pendingJobs) {
    throw new ConflictError(
      "preset_has_pending_jobs",
      "This preset has pending processing jobs and cannot be deleted yet.",
    );
  }

  try {
    await presets.delete(presetId);
  } catch (error) {
    if (error instanceof SystemPresetDeletionError) {
      throw new ConflictError("system_preset_immutable", error.message);
    }
    throw error;
  }

  return c.body(null, 204);
});

const MOCK_PREVIEW_PROVIDER = new MockTransformationProvider();

presetsRoute.post("/:presetId/preview", async (c) => {
  const presetId = c.req.param("presetId");
  const body = previewPresetInputSchema.parse({ ...(await c.req.json().catch(() => ({}))), id: presetId });

  const preset = await new PresetRepository(c.env.DB).findById(presetId);
  if (!preset) throw new NotFoundError("preset");

  const sourceWidth = body.sourceWidth ?? 1600;
  const sourceHeight = body.sourceHeight ?? 1200;

  const transformed = await MOCK_PREVIEW_PROVIDER.transform({
    assetId: "preview",
    assetSlug: "preview",
    sourceWidth,
    sourceHeight,
    sourceMimeType: "image/png",
    operations: preset.operations,
    outputFormat: preset.outputFormat,
    quality: preset.quality,
    presetHash: `preview-${presetId}`,
  });

  const svg = renderSimulatedVariantSvg({
    assetName: "Preview source",
    presetName: preset.name,
    width: transformed.width ?? sourceWidth,
    height: transformed.height ?? sourceHeight,
    outputFormat: preset.outputFormat === "auto" ? "auto (webp)" : preset.outputFormat,
  });
  const previewUrl = `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
  const placeholder = buildColorPlaceholderDataUri("#6366f1", transformed.width ?? 1, transformed.height ?? 1);

  return c.json({
    width: transformed.width,
    height: transformed.height,
    sizeBytes: new TextEncoder().encode(svg).byteLength,
    outputFormat: preset.outputFormat,
    simulated: true,
    previewUrl,
    placeholderUrl: placeholder,
  });
});
