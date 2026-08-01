/**
 * SVG is served as untrusted content (see SECURITY.md's SVG policy) — no
 * sanitization happens anywhere in this pipeline, and today every
 * simulated variant is literally rendered as SVG
 * (`renderSimulatedVariantSvg`), so this isn't a rare edge case. A CSP
 * that disables scripts/plugins/forms is defense in depth for the case a
 * client navigates directly to the URL (an `<img>` tag never executes
 * embedded SVG script either way, but a top-level navigation or an
 * `<object>`/`<iframe>` embed would without this).
 */
const SVG_MIME_TYPE = "image/svg+xml";
const SVG_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export function withSvgSecurityHeaders(
  headers: Record<string, string>,
  mimeType: string | null | undefined,
): Record<string, string> {
  if (!mimeType?.startsWith(SVG_MIME_TYPE)) return headers;
  return { ...headers, "Content-Security-Policy": SVG_CONTENT_SECURITY_POLICY };
}
