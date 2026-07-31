export interface ResponsiveSource {
  preset: string;
  width: number;
}

export interface ResponsiveSnippetInput {
  originalUrl: string;
  srcset: string;
  sizes: string;
  alt: string;
  width?: number;
  height?: number;
  cssClass?: string;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A responsive `<img>` using real, currently-ready preset URLs — `srcset` is built by
 * `DeliveryResource.srcset()` (already shared with `<imgyx-image>`), never a fabricated list.
 * `src` stays the plain original/preset URL as the fallback for browsers that ignore `srcset`.
 */
export function buildResponsiveHtmlSnippet(
  input: ResponsiveSnippetInput,
): string {
  const dims =
    input.width !== undefined && input.height !== undefined
      ? `\n  width="${input.width}"\n  height="${input.height}"`
      : "";
  const cssClass = input.cssClass
    ? `\n  class="${escapeAttribute(input.cssClass)}"`
    : "";
  return `<img
  src="${input.originalUrl}"
  srcset="${input.srcset}"
  sizes="${escapeAttribute(input.sizes)}"${dims}
  loading="lazy"
  alt="${escapeAttribute(input.alt)}"${cssClass}
/>`;
}

export interface SdkSnippetInput {
  project: string;
  asset: string;
  preset?: string;
}

/**
 * Mirrors `DeliveryResource`'s *real, shipped* method signature —
 * `presetUrl(project, asset, preset)`, positional arguments, not an options object — because a
 * snippet is only useful if copying it and running it actually works. Deliberately not the
 * options-object shape sometimes sketched in design docs: that would be a fabricated API model,
 * one of this phase's explicit non-goals.
 */
export function buildSdkSnippet(input: SdkSnippetInput): string {
  const call = input.preset
    ? `imageryx.delivery.presetUrl(${JSON.stringify(input.project)}, ${JSON.stringify(input.asset)}, ${JSON.stringify(input.preset)})`
    : `imageryx.delivery.originalUrl(${JSON.stringify(input.project)}, ${JSON.stringify(input.asset)})`;
  return `const url = ${call};`;
}

export interface CurlUploadSnippetInput {
  apiUrl: string;
  projectId: string;
}

export function buildCurlUploadSnippet(input: CurlUploadSnippetInput): string {
  return `curl -X POST ${input.apiUrl}/v1/assets/upload \\
  -H "Authorization: Bearer $IMAGERYX_API_KEY" \\
  -F "projectId=${input.projectId}" \\
  -F "file=@./photo.jpg"`;
}
