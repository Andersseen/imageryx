import type { Folder, ImagePreset, ProcessingJob } from "@imageryx/contracts";
import type {
  AssetDetails,
  AssetListItem,
  ImageryxClient,
  ImageVariant,
  ProjectSummary,
} from "@imageryx/sdk";
import { createImageryxClient } from "@imageryx/sdk";

/**
 * A real `ImageryxClient` backed by an in-memory fake of api-worker's routes.
 *
 * Deliberately stubbed at the `fetch` boundary rather than by replacing resource objects: every
 * component test then exercises the *actual* SDK — its URL and query-string building, its
 * FormData upload, and its error normalization into `ImageryxApiError` — instead of a
 * hand-written mock that can silently drift from the client the app really ships. A route that
 * the fake does not implement 404s loudly rather than returning `undefined`, so a typo in a path
 * fails the test instead of quietly producing an empty page.
 */

export const TEST_DELIVERY_URL = "http://delivery.test";

export interface StubApiState {
  projects?: ProjectSummary[];
  folders?: Folder[];
  tags?: string[];
  presets?: ImagePreset[];
  assets?: AssetListItem[];
  /** Total reported by the list endpoint; defaults to `assets.length`. Set explicitly to exercise pagination. */
  assetTotal?: number;
  /** Full workspace detail per asset id — falls back to synthesizing one from `assets` if absent. */
  assetDetails?: Record<string, AssetDetails>;
  processingJobs?: ProcessingJob[];
}

export interface StubApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface StubApi {
  client: ImageryxClient;
  /** Every request the app made, in order — for asserting *what* was requested, not just what rendered. */
  requests: StubApiRequest[];
  state: Required<StubApiState>;
  /** Overrides the response for one route, e.g. to make a single call fail. */
  override(
    method: string,
    pathPattern: RegExp,
    handler: () => Response | Promise<Response>,
  ): void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function apiErrorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return json({ error: { code, message, requestId: "req-test" } }, status);
}

function paginated<T>(items: T[], total: number, page = 1, pageSize = 24) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function createStubApi(initial: StubApiState = {}): StubApi {
  const state: Required<StubApiState> = {
    projects: initial.projects ?? [],
    folders: initial.folders ?? [],
    tags: initial.tags ?? [],
    presets: initial.presets ?? [],
    assets: initial.assets ?? [],
    assetTotal: initial.assetTotal ?? (initial.assets ?? []).length,
    assetDetails: initial.assetDetails ?? {},
    processingJobs: initial.processingJobs ?? [],
  };

  const requests: StubApiRequest[] = [];
  const overrides: {
    method: string;
    pattern: RegExp;
    handler: () => Response | Promise<Response>;
  }[] = [];

  const stubFetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://dashboard.test");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;

    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    } else if (init?.body instanceof FormData) {
      body = Object.fromEntries(init.body.entries());
    }
    requests.push({ method, path, query: url.searchParams, body });

    const override = overrides.find(
      (o) => o.method === method && o.pattern.test(path),
    );
    if (override) return override.handler();

    return route(method, path, url.searchParams, body, state);
  };

  const client = createImageryxClient({
    baseUrl: "/api",
    deliveryUrl: TEST_DELIVERY_URL,
    fetch: stubFetch,
  });

  return {
    client,
    requests,
    state,
    override(method, pattern, handler) {
      overrides.unshift({ method: method.toUpperCase(), pattern, handler });
    },
  };
}

function detailsFor(
  state: Required<StubApiState>,
  assetId: string,
): AssetDetails | null {
  const explicit = state.assetDetails[assetId];
  if (explicit) return explicit;
  const listItem = state.assets.find((a) => a.id === assetId);
  return listItem ? assetDetailsFixture(listItem) : null;
}

function putDetails(
  state: Required<StubApiState>,
  details: AssetDetails,
): void {
  state.assetDetails = { ...state.assetDetails, [details.id]: details };
}

// A single dispatch table for a test fake, rather than one function per route — splitting it
// would scatter the very thing worth reviewing in one place: exactly which routes are faked.
function route(
  method: string,
  path: string,
  query: URLSearchParams,
  body: unknown,
  state: Required<StubApiState>,
): Response {
  if (method === "GET" && path === "/api/v1/projects") {
    return json(paginated(state.projects, state.projects.length));
  }

  if (method === "POST" && path === "/api/v1/projects") {
    const input = body as {
      name: string;
      slug?: string;
      description?: string | null;
    };
    const created: ProjectSummary = {
      ...projectFixture(`project-${state.projects.length + 1}`, input.name),
      slug: input.slug ?? input.name.toLowerCase().replace(/\s+/g, "-"),
      description: input.description ?? null,
    };
    state.projects = [...state.projects, created];
    return json(created, 201);
  }

  const projectFolders = /^\/api\/v1\/projects\/[^/]+\/folders$/;
  if (method === "GET" && projectFolders.test(path)) {
    return json({ items: state.folders });
  }
  if (method === "POST" && projectFolders.test(path)) {
    const input = body as { name: string; parentId?: string | null };
    const created = folderFixture(
      `folder-${state.folders.length + 1}`,
      input.name,
    );
    state.folders = [...state.folders, created];
    return json(created, 201);
  }

  const projectTags = /^\/api\/v1\/projects\/[^/]+\/tags$/;
  if (method === "GET" && projectTags.test(path)) {
    return json({
      items: state.tags.map((name, index) => ({
        id: `tag-${index}`,
        projectId: "project-1",
        name,
        createdAt: "2026-07-01T00:00:00.000Z",
      })),
    });
  }

  if (method === "GET" && path === "/api/v1/presets") {
    let items = state.presets;
    const projectId = query.get("projectId");
    if (projectId) items = items.filter((p) => p.projectId === projectId);
    const system = query.get("system");
    if (system === "true") items = items.filter((p) => p.isSystem);
    if (system === "false") items = items.filter((p) => !p.isSystem);
    return json({ items });
  }
  if (method === "POST" && path === "/api/v1/presets") {
    const input = body as Partial<ImagePreset> & {
      name: string;
      projectId: string;
    };
    const created = presetFixture(
      `preset-${state.presets.length + 1}`,
      input.name,
      {
        projectId: input.projectId,
        slug: input.slug ?? input.name.toLowerCase().replace(/\s+/g, "-"),
        operations: input.operations ?? [],
        outputFormat: input.outputFormat ?? "auto",
        quality: input.quality ?? null,
      },
    );
    state.presets = [...state.presets, created];
    return json(created, 201);
  }

  const presetById = /^\/api\/v1\/presets\/([^/]+)$/;
  const presetMatch = presetById.exec(path);
  if (method === "GET" && presetMatch) {
    const preset = state.presets.find((p) => p.id === presetMatch[1]);
    if (!preset) return apiErrorResponse(404, "not_found", "Preset not found.");
    return json(preset);
  }
  if (method === "PATCH" && presetMatch) {
    const index = state.presets.findIndex((p) => p.id === presetMatch[1]);
    if (index === -1)
      return apiErrorResponse(404, "not_found", "Preset not found.");
    const updated = {
      ...state.presets[index],
      ...(body as Partial<ImagePreset>),
    } as ImagePreset;
    state.presets = state.presets.map((p, i) => (i === index ? updated : p));
    return json(updated);
  }
  if (method === "DELETE" && presetMatch) {
    const preset = state.presets.find((p) => p.id === presetMatch[1]);
    if (!preset) return apiErrorResponse(404, "not_found", "Preset not found.");
    if (preset.isSystem) {
      return apiErrorResponse(
        409,
        "system_preset_immutable",
        "System presets cannot be deleted.",
      );
    }
    state.presets = state.presets.filter((p) => p.id !== presetMatch[1]);
    return new Response(null, { status: 204 });
  }

  const presetPreview = /^\/api\/v1\/presets\/([^/]+)\/preview$/;
  const previewMatch = presetPreview.exec(path);
  if (method === "POST" && previewMatch) {
    const preset = state.presets.find((p) => p.id === previewMatch[1]);
    if (!preset) return apiErrorResponse(404, "not_found", "Preset not found.");
    return json({
      width: 800,
      height: 450,
      sizeBytes: 2048,
      outputFormat: preset.outputFormat,
      simulated: true,
      previewUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    });
  }

  if (method === "GET" && path === "/api/v1/assets") {
    const page = Number(query.get("page") ?? "1");
    const pageSize = Number(query.get("pageSize") ?? "24");
    return json(paginated(state.assets, state.assetTotal, page, pageSize));
  }

  if (method === "POST" && path === "/api/v1/assets/upload") {
    const uploaded =
      state.assets[0] ?? assetFixture("uploaded-asset", "Uploaded");
    return json(
      {
        asset: uploaded,
        processingJobId: "job-1",
        processingDispatch: { mode: "queue", dispatched: true },
        duplicateCandidates: [],
        securityWarnings: [],
      },
      201,
    );
  }

  const assetDelivery = /^\/api\/v1\/assets\/([^/]+)\/delivery$/;
  const deliveryMatch = assetDelivery.exec(path);
  if (method === "GET" && deliveryMatch) {
    const details = detailsFor(state, deliveryMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    return json({
      visibility: details.visibility,
      originalUrl: `${TEST_DELIVERY_URL}/${details.project?.slug}/assets/${details.path}`,
      presets: details.presets.map((p) => ({
        ...p,
        ready: details.variants.some(
          (v) => v.presetId === p.id && v.status === "ready",
        ),
        url: `${TEST_DELIVERY_URL}/${details.project?.slug}/assets/${details.path}/p/${p.slug}`,
      })),
    });
  }

  const assetVariants = /^\/api\/v1\/assets\/([^/]+)\/variants$/;
  const variantsMatch = assetVariants.exec(path);
  if (method === "GET" && variantsMatch) {
    const details = detailsFor(state, variantsMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    return json({ items: details.variants });
  }

  const assetActivity = /^\/api\/v1\/assets\/([^/]+)\/activity$/;
  const activityMatch = assetActivity.exec(path);
  if (method === "GET" && activityMatch) {
    const details = detailsFor(state, activityMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    return json({ items: details.activity });
  }

  const assetDownloadUrl = /^\/api\/v1\/assets\/([^/]+)\/download-url$/;
  const downloadUrlMatch = assetDownloadUrl.exec(path);
  if (method === "POST" && downloadUrlMatch) {
    const details = detailsFor(state, downloadUrlMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    const input = body as { variant?: string; expiresIn?: number };
    const variantParam = input.variant ?? "original";
    if (variantParam === "original" && !details.downloadOriginalEnabled) {
      return apiErrorResponse(
        409,
        "downloads_disabled",
        "Original downloads are disabled.",
      );
    }
    const expiresIn = input.expiresIn ?? 900;
    return json({
      url: `${TEST_DELIVERY_URL}/download/signed-token-${variantParam}`,
      expiresAt: new Date(
        Date.parse("2026-07-01T00:00:00.000Z") + expiresIn * 1000,
      ).toISOString(),
      variant: variantParam,
    });
  }

  const assetVariantsGenerate = /^\/api\/v1\/assets\/([^/]+)\/variants$/;
  const generateMatch = assetVariantsGenerate.exec(path);
  if (method === "POST" && generateMatch) {
    const details = detailsFor(state, generateMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    const input = body as { presetId: string; persist?: boolean };
    const existing = details.variants.find(
      (v) => v.presetId === input.presetId,
    );
    if (existing?.status === "ready") {
      return json(
        { variant: existing, processingJobId: null, status: "ready" },
        200,
      );
    }
    const variant = variantFixture(
      `variant-${details.variants.length + 1}`,
      details.id,
      input.presetId,
      {
        status: "pending",
      },
    );
    putDetails(state, { ...details, variants: [...details.variants, variant] });
    const jobId = `job-${variant.id}`;
    state.processingJobs = [
      ...state.processingJobs,
      processingJobFixture(jobId, details.projectId, {
        assetId: details.id,
        type: "generate-variant",
        status: "queued",
      }),
    ];
    return json({ variant, processingJobId: jobId, status: "created" }, 202);
  }

  if (method === "GET" && path === "/api/v1/processing-jobs") {
    const projectId = query.get("projectId");
    let items = state.processingJobs;
    if (projectId) items = items.filter((j) => j.projectId === projectId);
    const assetId = query.get("assetId");
    if (assetId) items = items.filter((j) => j.assetId === assetId);
    const status = query.get("status");
    if (status) items = items.filter((j) => j.status === status);
    const type = query.get("type");
    if (type) items = items.filter((j) => j.type === type);
    return json(paginated(items, items.length));
  }

  const jobById = /^\/api\/v1\/processing-jobs\/([^/]+)$/;
  const jobMatch = jobById.exec(path);
  if (method === "GET" && jobMatch) {
    const job = state.processingJobs.find((j) => j.id === jobMatch[1]);
    if (!job)
      return apiErrorResponse(404, "not_found", "Processing job not found.");
    return json(job);
  }

  const jobRetry = /^\/api\/v1\/processing-jobs\/([^/]+)\/retry$/;
  const retryMatch = jobRetry.exec(path);
  if (method === "POST" && retryMatch) {
    const job = state.processingJobs.find((j) => j.id === retryMatch[1]);
    if (!job)
      return apiErrorResponse(404, "not_found", "Processing job not found.");
    if (job.status !== "failed") {
      return apiErrorResponse(
        409,
        "job_not_retryable",
        `Only failed jobs can be retried.`,
      );
    }
    const updated = {
      ...job,
      status: "queued" as const,
      errorCode: null,
      errorMessage: null,
    };
    state.processingJobs = state.processingJobs.map((j) =>
      j.id === job.id ? updated : j,
    );
    return json(updated);
  }

  const jobCancel = /^\/api\/v1\/processing-jobs\/([^/]+)\/cancel$/;
  const cancelMatch = jobCancel.exec(path);
  if (method === "POST" && cancelMatch) {
    const job = state.processingJobs.find((j) => j.id === cancelMatch[1]);
    if (!job)
      return apiErrorResponse(404, "not_found", "Processing job not found.");
    if (job.status !== "queued") {
      return apiErrorResponse(
        409,
        "job_not_cancellable",
        `Only queued jobs can be cancelled.`,
      );
    }
    const updated = { ...job, status: "cancelled" as const };
    state.processingJobs = state.processingJobs.map((j) =>
      j.id === job.id ? updated : j,
    );
    return json(updated);
  }

  const assetMove = /^\/api\/v1\/assets\/([^/]+)\/move$/;
  const moveMatch = assetMove.exec(path);
  if (method === "POST" && moveMatch) {
    const details = detailsFor(state, moveMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    const input = body as { folderId: string | null };
    const folder = input.folderId
      ? state.folders.find((f) => f.id === input.folderId)
      : null;
    const updated: AssetDetails = {
      ...details,
      folderId: input.folderId,
      folder: folder
        ? { id: folder.id, name: folder.name, path: folder.path }
        : null,
    };
    putDetails(state, updated);
    return json(updated);
  }

  const assetTags = /^\/api\/v1\/assets\/([^/]+)\/tags$/;
  const tagsMatch = assetTags.exec(path);
  if (method === "PUT" && tagsMatch) {
    const details = detailsFor(state, tagsMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    const input = body as { tags: string[] };
    putDetails(state, { ...details, tags: input.tags });
    return json({ tags: input.tags });
  }

  const assetRestore = /^\/api\/v1\/assets\/([^/]+)\/restore$/;
  const restoreMatch = assetRestore.exec(path);
  if (method === "POST" && restoreMatch) {
    const details = detailsFor(state, restoreMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    if (!details.deletedAt) {
      return apiErrorResponse(
        409,
        "asset_not_deleted",
        "This asset is not deleted.",
      );
    }
    const updated = { ...details, deletedAt: null };
    putDetails(state, updated);
    return json(updated);
  }

  const assetById = /^\/api\/v1\/assets\/([^/]+)$/;
  const assetMatch = assetById.exec(path);
  if (method === "GET" && assetMatch) {
    const details = detailsFor(state, assetMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    return json(details);
  }
  if (method === "PATCH" && assetMatch) {
    const details = detailsFor(state, assetMatch[1] as string);
    if (!details) return apiErrorResponse(404, "not_found", "Asset not found.");
    if (details.deletedAt) {
      return apiErrorResponse(
        409,
        "asset_deleted",
        "This asset has been deleted.",
      );
    }
    const updated = { ...details, ...(body as Partial<AssetDetails>) };
    putDetails(state, updated);
    return json(updated);
  }
  if (method === "DELETE" && assetMatch) {
    const details = detailsFor(state, assetMatch[1] as string);
    if (details)
      putDetails(state, { ...details, deletedAt: "2026-07-01T00:00:00.000Z" });
    state.assets = state.assets.filter((a) => a.id !== assetMatch[1]);
    return new Response(null, { status: 204 });
  }

  return apiErrorResponse(
    404,
    "not_found",
    `No stub route for ${method} ${path}`,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export function projectFixture(
  id: string,
  name: string,
  isDefault = false,
): ProjectSummary {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    isDefault,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    assetCount: 0,
    folderCount: 0,
    presetCount: 0,
    totalOriginalBytes: 0,
    latestActivity: null,
  };
}

export function folderFixture(
  id: string,
  name: string,
  path = name.toLowerCase(),
): Folder {
  return {
    id,
    projectId: "project-1",
    parentId: null,
    name,
    slug: path,
    path,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

export function assetFixture(
  id: string,
  name: string,
  overrides: Partial<AssetListItem> = {},
): AssetListItem {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return {
    id,
    projectId: "project-1",
    folderId: null,
    name,
    slug,
    path: slug,
    storageKey: `originals/project-1/${id}/original.png`,
    originalFilename: `${slug}.png`,
    mimeType: "image/png",
    extension: "png",
    width: 1920,
    height: 1080,
    aspectRatio: 1.7778,
    sizeBytes: 204_800,
    checksum: "a".repeat(64),
    hasAlpha: false,
    dominantColor: "#336699",
    placeholder: "data:image/svg+xml,<svg/>",
    visibility: "public",
    processingStatus: "ready",
    downloadOriginalEnabled: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    tags: [],
    readyVariantCount: 0,
    readyPresetSlugs: [],
    folder: null,
    ...overrides,
  };
}

export function presetFixture(
  id: string,
  name: string,
  overrides: Partial<ImagePreset> = {},
): ImagePreset {
  return {
    id,
    projectId: "project-1",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    operations: [
      {
        type: "resize",
        width: 320,
        height: 320,
        fit: "cover",
        withoutEnlargement: true,
      },
    ],
    outputFormat: "auto",
    quality: 75,
    isSystem: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

export function variantFixture(
  id: string,
  assetId: string,
  presetId: string,
  overrides: Partial<ImageVariant> = {},
): ImageVariant {
  return {
    id,
    assetId,
    presetId,
    presetHash: `hash-${id}`,
    provider: "mock",
    storageKey: `derived/project-1/${assetId}/${id}.svg`,
    deliveryUrl: null,
    mimeType: "image/svg+xml",
    width: 320,
    height: 320,
    sizeBytes: 2048,
    checksum: "b".repeat(64),
    status: "ready",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

export function processingJobFixture(
  id: string,
  projectId: string,
  overrides: Partial<ProcessingJob> = {},
): ProcessingJob {
  return {
    id,
    projectId,
    assetId: "asset-1",
    type: "generate-variant",
    provider: "mock",
    status: "queued",
    input: {
      type: "generate-variant",
      assetId: "asset-1",
      presetId: "preset-1",
      presetHash: "h",
      persist: true,
    },
    result: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    failedAt: null,
    ...overrides,
  };
}

export function assetDetailsFixture(
  base: AssetListItem,
  overrides: Partial<AssetDetails> = {},
): AssetDetails {
  return {
    ...base,
    project: { id: base.projectId, name: "Angular Lab", slug: "angular-lab" },
    presets: [],
    variants: [],
    processingJobs: [],
    activity: [],
    delivery:
      base.visibility === "public"
        ? {
            originalUrl: `${TEST_DELIVERY_URL}/angular-lab/assets/${base.path}`,
            originalPath: `/angular-lab/assets/${base.path}`,
          }
        : null,
    duplicateCandidates: [],
    ...overrides,
  };
}

/** Convenience for tests that only need a working client and never inspect requests. */
export function stubClient(state: StubApiState = {}): ImageryxClient {
  return createStubApi(state).client;
}
