import { createStorageProvider, parseStorageConfig } from "@imageryx/providers";
import type { StorageProvider } from "@imageryx/providers";

/**
 * `parseStorageConfig`, not `parseProviderConfig`: this Worker stores and
 * reads bytes but never transforms them (transformation is
 * `processing-worker`'s job), so its storage access must not depend on
 * transformation credentials. It used to call `parseProviderConfig` while
 * passing only the two provider *names* — which meant that in production,
 * where `TRANSFORMATION_PROVIDER=cloudinary`, the parse always failed the
 * "Cloudinary requires credentials" check with credentials it never passed
 * in, and every upload and project purge died as a generic 500 before it
 * ever reached R2. See test/env.spec.ts.
 */
export function getStorageProvider(env: Env): StorageProvider {
  const config = parseStorageConfig({
    STORAGE_PROVIDER: env.STORAGE_PROVIDER,
    LOCAL_STORAGE_PATH: env.LOCAL_STORAGE_PATH,
  });
  return createStorageProvider({ config, r2Bucket: env.ASSET_STORAGE });
}

export function getMaxUploadSizeBytes(env: Env): number {
  return Number(env.MAX_UPLOAD_SIZE_MB) * 1024 * 1024;
}

export function getAssetRecoveryDays(env: Env): number {
  return Number(env.ASSET_RECOVERY_DAYS);
}

export function getProcessingMaxAttempts(env: Env): number {
  return Number(env.PROCESSING_MAX_ATTEMPTS);
}

export function isInlineLocalProcessing(env: Env): boolean {
  // Widened to `string`: wrangler infers a var's type as the literal value(s) it sees across
  // `vars` blocks in wrangler.jsonc ("queue" everywhere today), which would otherwise make this
  // comparison a type error the moment a local `.dev.vars` override sets a value TypeScript
  // never saw statically.
  return (env.PROCESSING_MODE as string) === "inline-local";
}
