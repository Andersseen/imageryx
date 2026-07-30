export interface ParsedDeliveryPath {
  assetPath: string;
  presetSlug: string | null;
}

/**
 * Route design: `/:projectSlug/assets/:rest` where `rest` is either the
 * asset's own logical path, or that path followed by a literal `/p/<presetSlug>`
 * marker segment (see ARCHITECTURE.md's "Delivery Worker resolution"
 * section). The marker is checked only against the *last two* segments —
 * an asset path whose own second-to-last segment happens to be literally
 * "p" is a known, documented, narrow ambiguity (see SECURITY.md).
 */
export function parseDeliveryPath(rest: string): ParsedDeliveryPath {
  const segments = rest.split("/").filter((segment) => segment.length > 0);
  if (segments.length >= 2 && segments[segments.length - 2] === "p") {
    return {
      assetPath: segments.slice(0, -2).join("/"),
      presetSlug: segments[segments.length - 1] as string,
    };
  }
  return { assetPath: segments.join("/"), presetSlug: null };
}
