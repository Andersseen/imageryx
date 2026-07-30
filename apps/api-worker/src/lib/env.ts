import { createStorageProvider, parseProviderConfig } from "@imageryx/providers";
import type { StorageProvider } from "@imageryx/providers";

export function getStorageProvider(env: Env): StorageProvider {
  const config = parseProviderConfig({
    STORAGE_PROVIDER: env.STORAGE_PROVIDER,
    TRANSFORMATION_PROVIDER: env.TRANSFORMATION_PROVIDER,
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
