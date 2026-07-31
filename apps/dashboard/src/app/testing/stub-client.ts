import type { Folder, ImagePreset } from "@imageryx/contracts";
import type {
  AssetListItem,
  ImageryxClient,
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
    return json({ items: state.presets });
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

  const assetById = /^\/api\/v1\/assets\/([^/]+)$/;
  const assetMatch = assetById.exec(path);
  if (method === "GET" && assetMatch) {
    const asset = state.assets.find((a) => a.id === assetMatch[1]);
    if (!asset) return apiErrorResponse(404, "not_found", "Asset not found.");
    return json(asset);
  }
  if (method === "DELETE" && assetMatch) {
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

/** Convenience for tests that only need a working client and never inspect requests. */
export function stubClient(state: StubApiState = {}): ImageryxClient {
  return createStubApi(state).client;
}
