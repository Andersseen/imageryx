import { assertSafeProductionSecrets } from "@imageryx/image-core";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "./request-id";

/**
 * Mirrors `api-worker`'s same-named middleware — see its comment for why
 * this runs on every request rather than once at boot. Only
 * `DOWNLOAD_SIGNING_SECRET` applies here; this Worker never holds
 * `IMAGERYX_API_KEY`.
 */
export const validateProductionEnv = createMiddleware<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>(async (c, next) => {
  assertSafeProductionSecrets(c.env.APP_ENV, [
    {
      name: "DOWNLOAD_SIGNING_SECRET",
      value: c.env.DOWNLOAD_SIGNING_SECRET,
      unsafeDefaultValue: "replace-with-local-development-secret",
    },
  ]);
  await next();
});
