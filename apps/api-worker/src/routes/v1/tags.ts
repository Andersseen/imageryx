import { tagSchema } from "@imageryx/contracts";
import { ProjectRepository, TagRepository } from "@imageryx/database";
import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors";
import { logActivity } from "../../lib/log-activity";
import { param } from "../../lib/params";
import type { RequestIdVariables } from "../../middleware/request-id";

type AppEnv = { Bindings: Env; Variables: RequestIdVariables };

/** Mounted at `/v1/projects/:projectId/tags` — project-scoped list and idempotent create. */
export const tagsForProjectRoute = new Hono<AppEnv>();

tagsForProjectRoute.get("/", async (c) => {
  const projectId = param(c, "projectId");
  const project = await new ProjectRepository(c.env.DB).findById(projectId);
  if (!project) throw new NotFoundError("project");

  const tags = await new TagRepository(c.env.DB).listByProject(projectId);
  return c.json({ items: tags });
});

const createTagBodySchema = z.object({ name: tagSchema });

tagsForProjectRoute.post("/", async (c) => {
  const projectId = param(c, "projectId");
  const project = await new ProjectRepository(c.env.DB).findById(projectId);
  if (!project) throw new NotFoundError("project");

  const body = createTagBodySchema.parse(await c.req.json());
  const tag = await new TagRepository(c.env.DB).findOrCreate(projectId, body.name);
  logActivity(c, "tag.created", { projectId, tagId: tag.id, name: tag.name });

  return c.json(tag, 201);
});

/** Mounted at `/v1/tags` — rename/delete by ID. */
export const tagsRoute = new Hono<AppEnv>();

const updateTagBodySchema = z.object({ name: tagSchema });

tagsRoute.patch("/:tagId", async (c) => {
  const tagId = param(c, "tagId");
  const body = updateTagBodySchema.parse(await c.req.json());
  const tags = new TagRepository(c.env.DB);

  const existing = await tags.findById(tagId);
  if (!existing) throw new NotFoundError("tag");

  const updated = await tags.rename(tagId, body.name);
  logActivity(c, "tag.updated", { tagId, name: body.name });

  return c.json(updated);
});

tagsRoute.delete("/:tagId", async (c) => {
  const tagId = param(c, "tagId");
  const tags = new TagRepository(c.env.DB);
  const existing = await tags.findById(tagId);
  if (!existing) throw new NotFoundError("tag");

  await tags.delete(tagId);
  logActivity(c, "tag.deleted", { tagId });

  return c.body(null, 204);
});
