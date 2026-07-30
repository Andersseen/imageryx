/**
 * @imageryx/providers
 *
 * Workers-safe storage and transformation provider interfaces and
 * implementations: `R2StorageProvider` (binding-injected, compiles
 * against the real R2 type but makes no request in this phase),
 * `MockTransformationProvider` (deterministic simulated transforms), and
 * parameter-mapping-only `CloudflareImagesProvider` / `CloudinaryProvider`
 * adapters (no real network calls in this phase).
 *
 * `LocalStorageProvider` is Node-only (`node:fs` — cannot run in
 * workerd) and lives behind the `@imageryx/providers/node` subpath
 * instead, so importing this barrel from a Worker never pulls in Node
 * built-ins.
 */

import type {
  StorageProviderName,
  TransformationProviderName,
} from "@imageryx/contracts";

export type {
  StorageProviderName,
  TransformationProviderName,
} from "@imageryx/contracts";

/**
 * Phase 1 compatibility aliases — `apps/api-worker` and `apps/dashboard`
 * import these two names from this package. The underlying value set
 * evolved for Phase 2 (`TransformationProviderId` dropped the unused
 * `'in-house'` placeholder in favor of `'cloudflare'`, per this phase's
 * spec); nothing in Phase 1 ever produced `'in-house'` as a real runtime
 * value, so this is a safe rename, not a breaking change. See context.md.
 */
export type StorageProviderId = StorageProviderName;
export type TransformationProviderId = TransformationProviderName;

export * from "./config/provider-config.schema";

export * from "./storage/r2-storage.provider";
export * from "./storage/storage-provider";

export * from "./transformations/cloudflare-images.provider";
export * from "./transformations/cloudinary.provider";
export * from "./transformations/mock-transformation.provider";
export * from "./transformations/transformation-provider";

export * from "./registry/provider-registry";
