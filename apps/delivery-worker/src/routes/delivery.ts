import { Hono } from "hono";
import { getStorageProvider } from "../lib/env";
import { parseDeliveryPath } from "../lib/path";
import { resolveDelivery } from "../lib/resolve-delivery";
import type { RequestIdVariables } from "../middleware/request-id";

export const deliveryRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

/**
 * Route design (see ARCHITECTURE.md): `/:projectSlug/assets/:rest{.+}`,
 * where `rest` is the asset's logical path, optionally followed by a
 * literal `/p/<presetSlug>` marker segment for a named-preset variant.
 */
deliveryRoute.get("/:projectSlug/assets/:rest{.+}", async (c) => {
  const projectSlug = c.req.param("projectSlug");
  const { assetPath, presetSlug } = parseDeliveryPath(c.req.param("rest"));

  if (assetPath.length === 0) {
    return c.json({ error: { code: "asset_not_found", message: "Not Found", requestId: c.get("requestId") } }, 404);
  }

  const outcome = await resolveDelivery(
    { db: c.env.DB, storage: getStorageProvider(c.env) },
    { projectSlug, assetPath, presetSlug, ifNoneMatch: c.req.header("If-None-Match") ?? null },
  );

  if (outcome.kind === "error") {
    return c.json(
      { error: { code: outcome.code, message: "Not Found", requestId: c.get("requestId") } },
      outcome.status,
    );
  }
  if (outcome.kind === "not-modified") {
    return c.body(null, 304, outcome.headers);
  }
  return c.body(outcome.body, 200, outcome.headers);
});
