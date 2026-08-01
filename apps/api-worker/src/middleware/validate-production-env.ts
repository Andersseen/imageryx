import { assertSafeProductionSecrets } from "@imageryx/image-core";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "./request-id";

/**
 * Mounted once, before every route (including `/health`) — a deployment
 * running with a real secret still equal to its committed local-dev
 * default should fail loudly on the very first request, not serve traffic
 * under a key anyone reading this public repo already knows. The real
 * `UnsafeProductionConfigError` message (which secret, missing vs.
 * default) is only ever logged server-side by the shared error handler,
 * never returned to the client — see `middleware/error-handler.ts`.
 */
export const validateProductionEnv = createMiddleware<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>(async (c, next) => {
  assertSafeProductionSecrets(c.env.APP_ENV, [
    {
      name: "IMAGERYX_API_KEY",
      value: c.env.IMAGERYX_API_KEY,
      unsafeDefaultValue: "imgx_dev_local",
    },
    {
      name: "DOWNLOAD_SIGNING_SECRET",
      value: c.env.DOWNLOAD_SIGNING_SECRET,
      unsafeDefaultValue: "replace-with-local-development-secret",
    },
  ]);
  await next();
});
