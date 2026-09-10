import { z } from "zod";

export const storageProviderNameSchema = z.enum(["local", "r2"]);
export type StorageProviderName = z.infer<typeof storageProviderNameSchema>;

/**
 * `"builtin"` is deliberately not named `"local"` — that name is already
 * `storageProviderNameSchema`'s term for "Node-only dev tooling that can't
 * run in workerd" (see `@imageryx/providers/node`), the opposite of what
 * this provider is: it runs in every environment, including production
 * Workers, performing real, deterministic, no-network domain logic (SVG
 * optimization today) rather than delegating to Cloudflare Images or
 * Cloudinary.
 */
export const transformationProviderNameSchema = z.enum([
  "mock",
  "cloudflare",
  "cloudinary",
  "builtin",
]);
export type TransformationProviderName = z.infer<
  typeof transformationProviderNameSchema
>;

/** Cost/latency posture a caller can request when several providers could satisfy an operation set. */
export const providerBudgetModeSchema = z.enum([
  "economy",
  "standard",
  "premium",
]);
export type ProviderBudgetMode = z.infer<typeof providerBudgetModeSchema>;
