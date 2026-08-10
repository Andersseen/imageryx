import { ApiKeyRepository } from "@imageryx/database";
import { createApiKey, hashApiKey } from "@imageryx/image-core";
import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors";
import type { RequestIdVariables } from "../../middleware/request-id";

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

function publicApiKey(record: {
  id: string;
  name: string | null;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}) {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

export const apiKeysRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

apiKeysRoute.get("/", async (c) => {
  const keys = await new ApiKeyRepository(c.env.DB).list();
  return c.json({ items: keys.map(publicApiKey) });
});

apiKeysRoute.post("/", async (c) => {
  const body = createApiKeySchema.parse(await c.req.json());
  const environment = c.env.APP_ENV === "production" ? "live" : "dev";
  const generated = createApiKey(environment);
  const repository = new ApiKeyRepository(c.env.DB);
  const created = await repository.create({
    name: body.name ?? null,
    prefix: generated.prefix,
    hashedSecret: await hashApiKey(generated.key),
  });

  return c.json({ ...publicApiKey(created), key: generated.key }, 201);
});

apiKeysRoute.delete("/:keyId", async (c) => {
  const revoked = await new ApiKeyRepository(c.env.DB).revoke(
    c.req.param("keyId"),
  );
  if (!revoked) throw new NotFoundError("api_key");
  return c.body(null, 204);
});
