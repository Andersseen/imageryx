/** Splits, trims and de-duplicates a comma-separated tag string; blank entries are dropped rather than sent. */
export function parseTags(input: string): string[] {
  const tags = input
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}
