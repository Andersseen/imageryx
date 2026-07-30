import {
  createProjectInputSchema,
  updateProjectInputSchema,
  type Project,
} from "@imageryx/contracts";
import {
  AssetActivityRepository,
  AssetRepository,
  FolderRepository,
  PresetPersistenceService,
  PresetRepository,
  ProjectRepository,
} from "@imageryx/database";
import { Hono } from "hono";
import { getStorageProvider } from "../../lib/env";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { logActivity } from "../../lib/log-activity";
import { buildPaginatedResponse } from "../../lib/pagination";
import { slugify } from "../../lib/slugify";
import type { RequestIdVariables } from "../../middleware/request-id";
import { foldersForProjectRoute } from "./folders";
import { tagsForProjectRoute } from "./tags";

export const projectsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

export interface ProjectSummary extends Project {
  assetCount: number;
  folderCount: number;
  presetCount: number;
  totalOriginalBytes: number;
  latestActivity: { event: string; createdAt: string } | null;
}

async function withSummaries(env: Env, items: Project[]): Promise<ProjectSummary[]> {
  const ids = items.map((project) => project.id);
  const [assetStats, folderCounts, presetCounts, latest] = await Promise.all([
    new AssetRepository(env.DB).countAndSizeByProjectIds(ids),
    new FolderRepository(env.DB).countByProjectIds(ids),
    new PresetRepository(env.DB).countByProjectIds(ids),
    new AssetActivityRepository(env.DB).latestByProjectIds(ids),
  ]);

  return items.map((project) => {
    const stats = assetStats.get(project.id);
    const latestActivity = latest.get(project.id);
    return {
      ...project,
      assetCount: stats?.count ?? 0,
      totalOriginalBytes: stats?.totalBytes ?? 0,
      folderCount: folderCounts.get(project.id) ?? 0,
      presetCount: presetCounts.get(project.id) ?? 0,
      latestActivity: latestActivity
        ? { event: latestActivity.event, createdAt: latestActivity.createdAt }
        : null,
    };
  });
}

const SORT_FIELDS = new Set(["name", "createdAt", "updatedAt"]);

projectsRoute.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "24") || 24));
  const search = c.req.query("search")?.trim() || undefined;
  const sortFieldRaw = c.req.query("sortField") ?? "createdAt";
  const sortField = SORT_FIELDS.has(sortFieldRaw)
    ? (sortFieldRaw as "name" | "createdAt" | "updatedAt")
    : "createdAt";
  const sortDirection = c.req.query("sortDirection") === "asc" ? "asc" : "desc";

  const projects = new ProjectRepository(c.env.DB);
  const { items, total } = await projects.listFiltered({
    page,
    pageSize,
    search,
    sortField,
    sortDirection,
  });
  const withStats = await withSummaries(c.env, items);

  return c.json(buildPaginatedResponse(withStats, page, pageSize, total));
});

projectsRoute.post("/", async (c) => {
  const body = createProjectInputSchema.parse(await c.req.json());
  const projects = new ProjectRepository(c.env.DB);

  const slug = body.slug ?? slugify(body.name);
  const existing = await projects.findBySlug(slug);
  if (existing) {
    throw new ConflictError(
      "duplicate_project_slug",
      `A project with slug "${slug}" already exists.`,
    );
  }

  const project = await projects.create({
    name: body.name,
    slug,
    description: body.description ?? null,
    isDefault: body.isDefault ?? false,
  });

  if (body.withSystemPresets) {
    await new PresetPersistenceService(c.env.DB).createSystemPresetsForProject(project.id);
  }

  logActivity(c, "project.created", { projectId: project.id, slug: project.slug });

  return c.json(project, 201);
});

projectsRoute.get("/:projectId", async (c) => {
  const projects = new ProjectRepository(c.env.DB);
  const project = await projects.findById(c.req.param("projectId"));
  if (!project) throw new NotFoundError("project");
  const [summary] = await withSummaries(c.env, [project]);
  return c.json(summary);
});

projectsRoute.patch("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const body = updateProjectInputSchema.parse({ ...(await c.req.json()), id: projectId });

  const projects = new ProjectRepository(c.env.DB);
  const existing = await projects.findById(projectId);
  if (!existing) throw new NotFoundError("project");

  const updated = await projects.update(projectId, {
    name: body.name,
    description: body.description,
    isDefault: body.isDefault,
  });
  if (!updated) throw new NotFoundError("project");

  // A project slug change moves *nothing* physically: storage keys are built from opaque IDs,
  // never slugs (see @imageryx/image-core's storage-key module) — only public delivery URLs
  // (which embed the project slug) change as a result.
  logActivity(c, "project.updated", {
    projectId,
    fields: Object.keys(body).filter((key) => key !== "id"),
  });

  return c.json(updated);
});

projectsRoute.delete("/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const cascade = c.req.query("cascade") === "true";

  const projects = new ProjectRepository(c.env.DB);
  const existing = await projects.findById(projectId);
  if (!existing) throw new NotFoundError("project");

  const assets = new AssetRepository(c.env.DB);
  const activeAssetCount = await assets.count({
    projectId,
    deleted: "active",
    page: 1,
    pageSize: 1,
    sortField: "createdAt",
    sortDirection: "desc",
  });

  if (activeAssetCount > 0 && !cascade) {
    throw new ConflictError(
      "project_has_active_assets",
      `Project "${projectId}" has ${activeAssetCount} active asset(s). Pass ?cascade=true to delete anyway, or remove the assets first.`,
      { activeAssetCount },
    );
  }

  if (cascade) {
    // Collects storage keys *before* the DB row cascade below removes them, then cleans up
    // storage off the request path (`waitUntil`, never blocking the HTTP response). This is a
    // best-effort cleanup, not a `processing_jobs` row — Phase 3 does not implement a generic
    // delete-object job handler; see context.md's "Project deletion" note.
    const allAssets = await assets.list({
      projectId,
      deleted: "all",
      page: 1,
      pageSize: 1000,
      sortField: "createdAt",
      sortDirection: "asc",
    });
    const storage = getStorageProvider(c.env);
    const keys = allAssets.map((asset) => asset.storageKey);
    c.executionCtx.waitUntil(
      Promise.allSettled(keys.map((key) => storage.delete(key))).then((results) => {
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed > 0) {
          console.error(
            JSON.stringify({
              event: "project.cascade_delete.storage_cleanup_failed",
              projectId,
              failedCount: failed,
            }),
          );
        }
      }),
    );
  }

  await projects.delete(projectId);
  return c.body(null, 204);
});

// Nested resources.
projectsRoute.route("/:projectId/folders", foldersForProjectRoute);
projectsRoute.route("/:projectId/tags", tagsForProjectRoute);
