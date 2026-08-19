import {
  storageProviderNameSchema,
  transformationProviderNameSchema,
  type StorageProviderName,
  type TransformationProviderName,
} from "@imageryx/contracts";
import { z } from "zod";

/**
 * Validates the flat, env-var-shaped configuration documented in
 * `.env.example`. Fails early (throws) on an invalid or incomplete
 * combination — e.g. `STORAGE_PROVIDER=local` with no `LOCAL_STORAGE_PATH`,
 * or a Cloudinary provider selected without credentials — rather than
 * deferring the failure to the first storage/transform call.
 */
const rawStorageEnvSchema = z.object({
  STORAGE_PROVIDER: storageProviderNameSchema,
  LOCAL_STORAGE_PATH: z.string().min(1).optional(),
});

const rawProviderEnvSchema = rawStorageEnvSchema.extend({
  TRANSFORMATION_PROVIDER: transformationProviderNameSchema,
  ADVANCED_TRANSFORMATION_PROVIDER: transformationProviderNameSchema.optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

export type ProviderEnv = Readonly<Record<string, string | undefined>>;

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** The storage half of {@link ProviderConfig} — everything `createStorageProvider` actually reads. */
export interface StorageConfig {
  storageProvider: StorageProviderName;
  localStoragePath: string | null;
}

export interface ProviderConfig extends StorageConfig {
  transformationProvider: TransformationProviderName;
  advancedTransformationProvider: TransformationProviderName | null;
  cloudinary: CloudinaryCredentials | null;
}

export class InvalidProviderConfigError extends Error {}

/**
 * Validates *only* the storage half of the configuration, for callers that
 * store and read bytes but never transform them (`api-worker`, the seed
 * script). Deliberately separate from `parseProviderConfig`: a Worker that
 * only needs R2 must not be taken down by an incomplete *transformation*
 * provider config — that coupling is what made every production upload
 * fail with a generic 500 while `TRANSFORMATION_PROVIDER=cloudinary` and
 * the Cloudinary secrets lived somewhere this call never passed them from.
 */
export function parseStorageConfig(env: ProviderEnv): StorageConfig {
  const parsed = rawStorageEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidProviderConfigError(
      `invalid provider configuration: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  const data = parsed.data;

  if (data.STORAGE_PROVIDER === "local" && !data.LOCAL_STORAGE_PATH) {
    throw new InvalidProviderConfigError(
      "LOCAL_STORAGE_PATH is required when STORAGE_PROVIDER=local",
    );
  }

  return {
    storageProvider: data.STORAGE_PROVIDER,
    localStoragePath: data.LOCAL_STORAGE_PATH ?? null,
  };
}

export function parseProviderConfig(env: ProviderEnv): ProviderConfig {
  const parsed = rawProviderEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new InvalidProviderConfigError(
      `invalid provider configuration: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  const data = parsed.data;

  const storage = parseStorageConfig(env);

  const needsCloudinary =
    data.TRANSFORMATION_PROVIDER === "cloudinary" ||
    data.ADVANCED_TRANSFORMATION_PROVIDER === "cloudinary";
  const cloudName = data.CLOUDINARY_CLOUD_NAME;
  const apiKey = data.CLOUDINARY_API_KEY;
  const apiSecret = data.CLOUDINARY_API_SECRET;
  if (needsCloudinary && !(cloudName && apiKey && apiSecret)) {
    throw new InvalidProviderConfigError(
      "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are all required when Cloudinary is the transformation or advanced-transformation provider",
    );
  }

  return {
    ...storage,
    transformationProvider: data.TRANSFORMATION_PROVIDER,
    advancedTransformationProvider:
      data.ADVANCED_TRANSFORMATION_PROVIDER ?? null,
    cloudinary:
      needsCloudinary && cloudName && apiKey && apiSecret
        ? { cloudName, apiKey, apiSecret }
        : null,
  };
}
