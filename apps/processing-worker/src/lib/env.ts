import {
  createStorageProvider,
  parseProviderConfig,
} from "@imageryx/providers";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { D1Client } from "@imageryx/database";
import type { ProcessingDeps } from "../jobs/deps";

/**
 * Explicit structural type instead of the ambient `Env` global: this
 * function is imported cross-Worker (by `api-worker`'s
 * `PROCESSING_MODE=inline-local` fallback), and each Worker's
 * `worker-configuration.d.ts` declares its *own* global `Env` in a file
 * the other Worker's tsconfig never includes — ambient globals don't
 * merge across separate compilation programs. Any caller's own `Env`
 * (api-worker's or processing-worker's) structurally satisfies this
 * shape, so passing `c.env` from either Worker just works.
 */
export interface ProcessingEnvBindings {
  DB: D1Client;
  ASSET_STORAGE: R2Bucket;
  STORAGE_PROVIDER: string;
  TRANSFORMATION_PROVIDER: string;
  PROCESSING_MAX_ATTEMPTS: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
}

export function buildProcessingDeps(env: ProcessingEnvBindings): ProcessingDeps {
  const config = parseProviderConfig({
    STORAGE_PROVIDER: env.STORAGE_PROVIDER,
    TRANSFORMATION_PROVIDER: env.TRANSFORMATION_PROVIDER,
    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME || undefined,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY || undefined,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET || undefined,
  });
  return {
    db: env.DB,
    storage: createStorageProvider({ config, r2Bucket: env.ASSET_STORAGE }),
    maxAttempts: Number(env.PROCESSING_MAX_ATTEMPTS),
    cloudinary: config.cloudinary,
  };
}
