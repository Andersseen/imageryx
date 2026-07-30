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
const rawProviderEnvSchema = z.object({
  STORAGE_PROVIDER: storageProviderNameSchema,
  TRANSFORMATION_PROVIDER: transformationProviderNameSchema,
  ADVANCED_TRANSFORMATION_PROVIDER: transformationProviderNameSchema.optional(),
  LOCAL_STORAGE_PATH: z.string().min(1).optional(),
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

export interface ProviderConfig {
  storageProvider: StorageProviderName;
  transformationProvider: TransformationProviderName;
  advancedTransformationProvider: TransformationProviderName | null;
  localStoragePath: string | null;
  cloudinary: CloudinaryCredentials | null;
}

export class InvalidProviderConfigError extends Error {}

export function parseProviderConfig(env: ProviderEnv): ProviderConfig {
  const parsed = rawProviderEnvSchema.safeParse(env);
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
    storageProvider: data.STORAGE_PROVIDER,
    transformationProvider: data.TRANSFORMATION_PROVIDER,
    advancedTransformationProvider:
      data.ADVANCED_TRANSFORMATION_PROVIDER ?? null,
    localStoragePath: data.LOCAL_STORAGE_PATH ?? null,
    cloudinary:
      needsCloudinary && cloudName && apiKey && apiSecret
        ? { cloudName, apiKey, apiSecret }
        : null,
  };
}
