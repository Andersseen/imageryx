import { z } from "zod";
import { supportedImageMimeTypeSchema } from "../common/identifiers";

export const statsResponseSchema = z.object({
  projectCount: z.number().int().nonnegative(),
  activeAssetCount: z.number().int().nonnegative(),
  deletedAssetCount: z.number().int().nonnegative(),
  totalOriginalBytes: z.number().int().nonnegative(),
  readyVariantCount: z.number().int().nonnegative(),
  pendingJobCount: z.number().int().nonnegative(),
  failedJobCount: z.number().int().nonnegative(),
  assetsByFormat: z.array(
    z.object({
      mimeType: supportedImageMimeTypeSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  assetsByProject: z.array(
    z.object({
      projectId: z.string(),
      projectName: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  recentActivity: z.array(
    z.object({
      id: z.string(),
      assetId: z.string(),
      projectId: z.string(),
      event: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;
