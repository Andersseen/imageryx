import type { R2Bucket } from "@cloudflare/workers-types";
import { createStorageProvider, parseStorageConfig } from "@imageryx/providers";
import type { StorageProvider } from "@imageryx/providers";

/**
 * An explicit structural type for exactly the binding fields this file
 * reads, instead of the ambient `Env` global `wrangler types` generates —
 * this file is imported by `apps/api-worker/src/portable.ts`'s reuse chain
 * (`projects.ts` calls `getStorageProvider`), and `Env` is only declared
 * inside api-worker's own `worker-configuration.d.ts`, invisible to any
 * other package's tsconfig program (the exact ambient-type friction
 * context.md's "Cross-runtime ambient type friction" note describes, and
 * the same fix `apps/processing-worker/src/lib/env.ts`'s
 * `ProcessingEnvBindings` already uses). The real Cloudflare `Env`
 * structurally satisfies this interface, so nothing changes at the one
 * real call site (`index.ts`'s `c.env`).
 */
export interface ApiWorkerEnvBindings {
  STORAGE_PROVIDER: string;
  LOCAL_STORAGE_PATH?: string;
  ASSET_STORAGE: R2Bucket;
  MAX_UPLOAD_SIZE_MB: string;
  ASSET_RECOVERY_DAYS: string;
  PROCESSING_MAX_ATTEMPTS: string;
  PROCESSING_MODE: string;
}

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
export function getStorageProvider(env: ApiWorkerEnvBindings): StorageProvider {
  const config = parseStorageConfig({
    STORAGE_PROVIDER: env.STORAGE_PROVIDER,
    LOCAL_STORAGE_PATH: env.LOCAL_STORAGE_PATH,
  });
  return createStorageProvider({ config, r2Bucket: env.ASSET_STORAGE });
}

export function getMaxUploadSizeBytes(env: ApiWorkerEnvBindings): number {
  return Number(env.MAX_UPLOAD_SIZE_MB) * 1024 * 1024;
}

export function getAssetRecoveryDays(env: ApiWorkerEnvBindings): number {
  return Number(env.ASSET_RECOVERY_DAYS);
}

export function getProcessingMaxAttempts(env: ApiWorkerEnvBindings): number {
  return Number(env.PROCESSING_MAX_ATTEMPTS);
}

export function isInlineLocalProcessing(env: ApiWorkerEnvBindings): boolean {
  // Widened to `string`: wrangler infers a var's type as the literal value(s) it sees across
  // `vars` blocks in wrangler.jsonc ("queue" everywhere today), which would otherwise make this
  // comparison a type error the moment a local `.dev.vars` override sets a value TypeScript
  // never saw statically.
  return (env.PROCESSING_MODE as string) === "inline-local";
}
