import { z } from "zod";

export const storageProviderNameSchema = z.enum(["local", "r2"]);
export type StorageProviderName = z.infer<typeof storageProviderNameSchema>;

export const transformationProviderNameSchema = z.enum([
  "mock",
  "cloudflare",
  "cloudinary",
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
