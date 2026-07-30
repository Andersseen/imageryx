import { Hono } from "hono";
import { getStorageProvider } from "../lib/env";
import { resolveSignedDownload } from "../lib/signed-download";
import type { RequestIdVariables } from "../middleware/request-id";

export const downloadRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

downloadRoute.get("/:token", async (c) => {
  const outcome = await resolveSignedDownload(
    {
      db: c.env.DB,
      storage: getStorageProvider(c.env),
      signingSecret: c.env.DOWNLOAD_SIGNING_SECRET,
    },
    c.req.param("token"),
  );

  if (outcome.kind === "error") {
    return c.json(
      { error: { code: outcome.code, message: "Not Found", requestId: c.get("requestId") } },
      outcome.status,
    );
  }

  return c.body(outcome.body, 200, outcome.headers);
});
