/**
 * Delivery Worker route design (see ARCHITECTURE.md): `/:projectSlug/assets/:assetPath[/p/:presetSlug]`.
 * Shared by `api-worker` (reports these URLs in API responses),
 * `@imageryx/sdk` (builds them client-side), and `@imageryx/angular`
 * (builds them for `<imgyx-image>`), so all three ever agree on one format.
 */
export function buildDeliveryPath(
  projectSlug: string,
  assetPath: string,
  presetSlug?: string,
): string {
  const base = `/${projectSlug}/assets/${assetPath}`;
  return presetSlug ? `${base}/p/${presetSlug}` : base;
}

export function buildDeliveryUrl(
  deliveryBaseUrl: string,
  projectSlug: string,
  assetPath: string,
  presetSlug?: string,
): string {
  return `${deliveryBaseUrl.replace(/\/+$/, "")}${buildDeliveryPath(projectSlug, assetPath, presetSlug)}`;
}
