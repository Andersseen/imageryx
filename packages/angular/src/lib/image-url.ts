import { buildDeliveryUrl } from "@imageryx/image-core";

export interface ResponsivePresetInput {
  preset: string;
  width: number;
}

/**
 * Pure logic behind `<imgyx-image>`'s computed signals — factored out of
 * the component so it's testable without an Angular `TestBed`/DOM
 * environment. Builds on `@imageryx/image-core`'s delivery-path builder,
 * the same one `api-worker` and `@imageryx/sdk` use, so a URL generated
 * here always matches what `delivery-worker` actually serves.
 */
export function resolveImageSrc(
  deliveryBaseUrl: string,
  project: string,
  asset: string,
  preset?: string,
): string {
  return buildDeliveryUrl(deliveryBaseUrl, project, asset, preset);
}

export function resolveSrcset(
  deliveryBaseUrl: string,
  project: string,
  asset: string,
  presets: readonly ResponsivePresetInput[] | undefined,
): string {
  if (!presets || presets.length === 0) return "";
  return presets
    .map((entry) => `${resolveImageSrc(deliveryBaseUrl, project, asset, entry.preset)} ${entry.width}w`)
    .join(", ");
}

/** Accepts either a plain CSS color or a URL (including `data:` URIs) as the placeholder background. */
export function resolveBackgroundStyle(placeholder: string | undefined | null): string | null {
  if (!placeholder) return null;
  return placeholder.startsWith("data:") || placeholder.startsWith("http")
    ? `center / cover no-repeat url("${placeholder}")`
    : placeholder;
}

/** `null` when either dimension is missing — CSS `aspect-ratio` is only meaningful with both. */
export function resolveAspectRatio(
  width: number | undefined,
  height: number | undefined,
): string | null {
  return width && height ? `${width} / ${height}` : null;
}
