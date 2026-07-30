/** Encodes a single dynamic path segment (an ID, slug, or token) — never a raw template interpolation, so a value containing `/` or other reserved characters can't be mistaken for extra path segments. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
