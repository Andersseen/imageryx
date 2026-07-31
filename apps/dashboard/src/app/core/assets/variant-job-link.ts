import type { ImageVariant, ProcessingJob } from "@imageryx/sdk";

/**
 * Finds the `generate-variant` job that produced (or is producing) a given variant.
 *
 * There is no direct foreign key from a variant row to its job — the two are linked only by
 * having been created from the same preset for the same asset, so this matches on
 * `presetHash`, which `generate-variant`'s job input carries verbatim (see
 * `generateVariantInputSchema`). A preset hash plus asset id is the variant's real uniqueness
 * key (`idx_variants_unique_asset_preset_hash`), so this can never collide with a different
 * variant's job.
 */
export function findJobForVariant(
  variant: ImageVariant,
  jobs: readonly ProcessingJob[],
): ProcessingJob | null {
  return (
    jobs.find(
      (job) =>
        job.type === "generate-variant" &&
        job.input.type === "generate-variant" &&
        job.input.presetHash === variant.presetHash,
    ) ?? null
  );
}
