import { z } from "zod";
import {
  assetIdSchema,
  presetIdSchema,
  variantIdSchema,
} from "../common/identifiers";
import { transformationProviderNameSchema } from "../providers/provider.schema";

/** `"auto"` defers to `selectTransformationProvider` (image-core); an explicit name short-circuits it. */
export const preferredProviderSchema = z.union([
  z.literal("auto"),
  transformationProviderNameSchema,
]);
export type PreferredProvider = z.infer<typeof preferredProviderSchema>;

export const createVariantInputSchema = z.object({
  assetId: assetIdSchema,
  presetId: presetIdSchema,
  /** Whether the derived output should be written to storage. `false` is only meaningful for providers that support dynamic delivery (Cloudflare); mock always persists. */
  persist: z.boolean().default(true),
  preferredProvider: preferredProviderSchema.default("auto"),
});
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;

export const getVariantInputSchema = z.object({ id: variantIdSchema });
export type GetVariantInput = z.infer<typeof getVariantInputSchema>;

export const listVariantsInputSchema = z.object({
  assetId: assetIdSchema,
});
export type ListVariantsInput = z.infer<typeof listVariantsInputSchema>;
