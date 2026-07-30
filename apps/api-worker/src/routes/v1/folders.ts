import { type Folder, folderNameSchema, folderSlugSchema } from "@imageryx/contracts";
import { AssetRepository, FolderRepository, ProjectRepository } from "@imageryx/database";
import { joinLogicalPath } from "@imageryx/image-core";
import { Hono } from "hono";
import { z } from "zod";
import { ConflictError, NotFoundError, ValidationHttpError } from "../../lib/errors";
import { logActivity } from "../../lib/log-activity";
import { param } from "../../lib/params";
import { slugify } from "../../lib/slugify";
import type { RequestIdVariables } from "../../middleware/request-id";

const MAX_FOLDER_DEPTH = 12;

type AppEnv = { Bindings: Env; Variables: RequestIdVariables };

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
}

function buildTree(folders: Folder[]): FolderTreeNode[] {
  const nodes = new Map<string, FolderTreeNode>(
    folders.map((folder) => [folder.id, { ...folder, children: [] }]),
  );
  const roots: FolderTreeNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id);
    if (!node) continue;
    if (folder.parentId && nodes.has(folder.parentId)) {
      nodes.get(folder.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function assertProjectExists(db: Env["DB"], projectId: string): Promise<void> {
  const project = await new ProjectRepository(db).findById(projectId);
  if (!project) throw new NotFoundError("project");
}

/** Mounted at `/v1/projects/:projectId/folders` — list (flat + optional tree) and create. */
export const foldersForProjectRoute = new Hono<AppEnv>();

foldersForProjectRoute.get("/", async (c) => {
  const projectId = param(c, "projectId");
  await assertProjectExists(c.env.DB, projectId);

  const folders = await new FolderRepository(c.env.DB).listByProject(projectId);
  const includeTree = c.req.query("tree") === "true";

  return c.json({ items: folders, ...(includeTree ? { tree: buildTree(folders) } : {}) });
});

const createFolderBodySchema = z.object({
  name: folderNameSchema,
  slug: folderSlugSchema.optional(),
  parentId: z.string().nullable().optional(),
});

foldersForProjectRoute.post("/", async (c) => {
  const projectId = param(c, "projectId");
  await assertProjectExists(c.env.DB, projectId);

  const body = createFolderBodySchema.parse(await c.req.json());
  const folders = new FolderRepository(c.env.DB);

  let parent = null;
  if (body.parentId) {
    parent = await folders.findById(body.parentId);
    if (!parent || parent.projectId !== projectId) {
      throw new ValidationHttpError("parentId does not reference a folder in this project.");
    }
  }

  const slug = body.slug ?? slugify(body.name);
  const path = parent ? joinLogicalPath(parent.path, slug) : slug;
  const depth = path.split("/").length;
  if (depth > MAX_FOLDER_DEPTH) {
    throw new ValidationHttpError(
      `Folder nesting exceeds the maximum depth of ${MAX_FOLDER_DEPTH}.`,
    );
  }

  const conflict = await folders.findByPath(projectId, path);
  if (conflict) {
    throw new ConflictError(
      "duplicate_folder_slug",
      `A folder with slug "${slug}" already exists under this parent.`,
    );
  }

  const folder = await folders.create({
    projectId,
    parentId: parent?.id ?? null,
    name: body.name,
    slug,
    path,
  });

  logActivity(c, "folder.created", { projectId, folderId: folder.id, path: folder.path });

  return c.json(folder, 201);
});

/** Mounted at `/v1/folders` — get/update/delete by ID, independent of a project prefix. */
export const foldersRoute = new Hono<AppEnv>();

foldersRoute.get("/:folderId", async (c) => {
  const folder = await new FolderRepository(c.env.DB).findById(param(c, "folderId"));
  if (!folder) throw new NotFoundError("folder");
  return c.json(folder);
});

const updateFolderBodySchema = z
  .object({
    name: folderNameSchema.optional(),
    parentId: z.string().nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.parentId !== undefined, {
    message: "at least one updatable field must be provided",
  });

foldersRoute.patch("/:folderId", async (c) => {
  const folderId = param(c, "folderId");
  const body = updateFolderBodySchema.parse(await c.req.json());
  const folders = new FolderRepository(c.env.DB);

  const existing = await folders.findById(folderId);
  if (!existing) throw new NotFoundError("folder");

  let updated = existing;

  if (body.name !== undefined) {
    const renamed = await folders.rename(folderId, body.name);
    if (renamed) updated = renamed;
  }

  if (body.parentId !== undefined) {
    if (body.parentId === folderId) {
      throw new ValidationHttpError("A folder cannot be moved into itself.");
    }
    if (body.parentId) {
      const targetParent = await folders.findById(body.parentId);
      if (!targetParent || targetParent.projectId !== existing.projectId) {
        throw new ValidationHttpError("parentId does not reference a folder in this project.");
      }
      if (targetParent.path === existing.path || targetParent.path.startsWith(`${existing.path}/`)) {
        throw new ValidationHttpError("A folder cannot be moved into itself or one of its descendants.");
      }
      const depth = joinLogicalPath(targetParent.path, existing.slug).split("/").length;
      if (depth > MAX_FOLDER_DEPTH) {
        throw new ValidationHttpError(
          `Folder nesting exceeds the maximum depth of ${MAX_FOLDER_DEPTH}.`,
        );
      }
    }
    const moved = await folders.move(folderId, body.parentId);
    if (moved) updated = moved;
  }

  logActivity(c, "folder.updated", { folderId, fields: Object.keys(body) });

  return c.json(updated);
});

foldersRoute.delete("/:folderId", async (c) => {
  const folderId = param(c, "folderId");
  const folders = new FolderRepository(c.env.DB);
  const existing = await folders.findById(folderId);
  if (!existing) throw new NotFoundError("folder");

  const [children, activeAssetCount] = await Promise.all([
    folders.listByParent(existing.projectId, folderId),
    new AssetRepository(c.env.DB).count({
      projectId: existing.projectId,
      folderId,
      deleted: "active",
      page: 1,
      pageSize: 1,
      sortField: "createdAt",
      sortDirection: "desc",
    }),
  ]);

  if (children.length > 0 || activeAssetCount > 0) {
    throw new ConflictError(
      "folder_not_empty",
      "This folder has active child folders or assets and cannot be deleted.",
      { childFolderCount: children.length, activeAssetCount },
    );
  }

  await folders.delete(folderId);
  return c.body(null, 204);
});
