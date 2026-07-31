import type { ImageVariant } from "@imageryx/sdk";

export interface PresetLookup {
  id: string;
  name: string;
  slug: string;
}

export interface VariantView {
  variant: ImageVariant;
  presetName: string;
  presetSlug: string | null;
  /** Short, stable identifier for a variant that has no human name of its own — a preset hash. */
  presetHashAbbreviation: string;
  /** A delivery URL only when the variant is actually `ready` — see `resolveThumbnailPreset` for why guessing is wrong. */
  deliveryUrl: string | null;
  /** True for the mock provider — the transformation is a labeled placeholder, not a real resize. */
  isSimulated: boolean;
  /** Whether this variant's bytes were actually written to storage (vs. a dynamic-delivery provider that only maps parameters). */
  isPersisted: boolean;
}

const HASH_ABBREVIATION_LENGTH = 10;

/**
 * Joins one variant with the preset it was generated from and the delivery URL it resolves to,
 * if any. A preset can be renamed after a variant exists — hashing, not the slug, is the
 * variant's real identity (see ARCHITECTURE.md's "Preset normalization and hashing") — so this
 * always resolves the *current* preset name/slug via `presetId`, never trusts a cached label.
 */
export function toVariantView(
  variant: ImageVariant,
  presets: readonly PresetLookup[],
  buildUrl: (
    projectSlug: string,
    assetPath: string,
    presetSlug: string,
  ) => string,
  projectSlug: string,
  assetPath: string,
): VariantView {
  const preset = presets.find((p) => p.id === variant.presetId);
  return {
    variant,
    presetName: preset?.name ?? "Unknown preset",
    presetSlug: preset?.slug ?? null,
    presetHashAbbreviation: variant.presetHash.slice(
      0,
      HASH_ABBREVIATION_LENGTH,
    ),
    deliveryUrl:
      variant.status === "ready" && preset
        ? buildUrl(projectSlug, assetPath, preset.slug)
        : null,
    isSimulated: variant.provider === "mock",
    isPersisted: variant.storageKey !== null,
  };
}

export function toVariantViews(
  variants: readonly ImageVariant[],
  presets: readonly PresetLookup[],
  buildUrl: (
    projectSlug: string,
    assetPath: string,
    presetSlug: string,
  ) => string,
  projectSlug: string,
  assetPath: string,
): VariantView[] {
  return variants.map((variant) =>
    toVariantView(variant, presets, buildUrl, projectSlug, assetPath),
  );
}
