import type { AssetDetails } from "@imageryx/sdk";

export interface DeliveryPresetOption {
  id: string;
  slug: string;
  name: string;
  ready: boolean;
  /** `null` until a `ready` variant exists — a not-yet-generated preset has no URL that actually resolves. */
  url: string | null;
  width: number | null;
}

/**
 * Every preset in the project, joined with whether *this* asset has a ready variant for it and
 * the delivery URL that follows — reusing the same `AssetDetails` payload the whole workspace
 * already has, so opening the Delivery tab costs no extra request.
 */
export function buildDeliveryPresetOptions(
  asset: AssetDetails,
  buildUrl: (
    projectSlug: string,
    assetPath: string,
    presetSlug: string,
  ) => string,
  projectSlug: string,
): DeliveryPresetOption[] {
  return asset.presets.map((preset) => {
    const variant = asset.variants.find((v) => v.presetId === preset.id);
    const ready = variant?.status === "ready";
    return {
      id: preset.id,
      slug: preset.slug,
      name: preset.name,
      ready,
      url: ready ? buildUrl(projectSlug, asset.path, preset.slug) : null,
      width: variant?.width ?? null,
    };
  });
}
