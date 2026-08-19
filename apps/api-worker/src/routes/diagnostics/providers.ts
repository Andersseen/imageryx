import { transformationProviderNameSchema } from "@imageryx/contracts";
import {
  CLOUDFLARE_CAPABILITIES,
  CLOUDINARY_CAPABILITIES,
  InvalidProviderConfigError,
  MOCK_CAPABILITIES,
  parseStorageConfig,
} from "@imageryx/providers";
import { Hono } from "hono";
import type { RequestIdVariables } from "../../middleware/request-id";

export const providersDiagnosticsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

/**
 * Reports which providers this deployment is configured with, and their
 * capabilities — never credentials.
 *
 * `valid` covers what this Worker actually owns: its **storage**
 * configuration. It deliberately does not fail on incomplete *transformation*
 * credentials, because api-worker never transforms anything (that is
 * `processing-worker`, which holds its own Cloudinary secrets and validates
 * them itself) — so the credentials for `TRANSFORMATION_PROVIDER=cloudinary`
 * are usually, and correctly, absent here. Running the full provider parse
 * meant this route answered `valid: false` with a 500 on every production
 * request and `cloudinaryConfigured` could never be `true`, which is the same
 * mistake that made every production upload fail (see `lib/env.ts`).
 *
 * `cloudinaryConfigured` reports only whether *this* Worker holds a complete
 * credential triple; the triple itself never reaches the response body.
 */
providersDiagnosticsRoute.get("/", (c) => {
  try {
    const storage = parseStorageConfig({
      STORAGE_PROVIDER: c.env.STORAGE_PROVIDER,
      LOCAL_STORAGE_PATH: c.env.LOCAL_STORAGE_PATH,
    });

    const transformationProvider = transformationProviderNameSchema.parse(
      c.env.TRANSFORMATION_PROVIDER,
    );

    return c.json({
      valid: true,
      storageProvider: storage.storageProvider,
      transformationProvider,
      // Always `null`, as before: this Worker's `Env` has no
      // ADVANCED_TRANSFORMATION_PROVIDER binding to report.
      advancedTransformationProvider: null,
      cloudinaryConfigured: Boolean(
        c.env.CLOUDINARY_CLOUD_NAME &&
        c.env.CLOUDINARY_API_KEY &&
        c.env.CLOUDINARY_API_SECRET,
      ),
      capabilities: {
        mock: MOCK_CAPABILITIES,
        cloudflare: CLOUDFLARE_CAPABILITIES,
        cloudinary: CLOUDINARY_CAPABILITIES,
      },
    });
  } catch (error) {
    const reason =
      error instanceof InvalidProviderConfigError
        ? error.message
        : "invalid provider configuration";
    return c.json({ valid: false, reason }, 500);
  }
});
