import { z } from "zod";
import {
  assetIdSchema,
  presetIdSchema,
  variantIdSchema,
} from "../common/identifiers";

export const createVariantInputSchema = z.object({
  assetId: assetIdSchema,
  presetId: presetIdSchema,
});
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;

export const getVariantInputSchema = z.object({ id: variantIdSchema });
export type GetVariantInput = z.infer<typeof getVariantInputSchema>;

export const listVariantsInputSchema = z.object({
  assetId: assetIdSchema,
});
export type ListVariantsInput = z.infer<typeof listVariantsInputSchema>;
