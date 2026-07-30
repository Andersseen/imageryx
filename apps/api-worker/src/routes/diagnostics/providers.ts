import {
  CLOUDFLARE_CAPABILITIES,
  CLOUDINARY_CAPABILITIES,
  InvalidProviderConfigError,
  MOCK_CAPABILITIES,
  parseProviderConfig,
} from "@imageryx/providers";
import { Hono } from "hono";
import type { RequestIdVariables } from "../../middleware/request-id";

export const providersDiagnosticsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

/**
 * Reports which providers are configured and their capabilities — never
 * credentials. `parseProviderConfig` only ever receives the vars this
 * route explicitly lists, so a Cloudinary secret (if ever configured)
 * cannot leak here even by accident.
 */
providersDiagnosticsRoute.get("/", (c) => {
  try {
    const config = parseProviderConfig({
      STORAGE_PROVIDER: c.env.STORAGE_PROVIDER,
      TRANSFORMATION_PROVIDER: c.env.TRANSFORMATION_PROVIDER,
      LOCAL_STORAGE_PATH: c.env.LOCAL_STORAGE_PATH,
    });

    return c.json({
      valid: true,
      storageProvider: config.storageProvider,
      transformationProvider: config.transformationProvider,
      advancedTransformationProvider: config.advancedTransformationProvider,
      cloudinaryConfigured: config.cloudinary !== null,
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
