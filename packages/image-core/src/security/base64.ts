/**
 * UTF-8-safe base64 encoding. Plain `btoa()` only accepts Latin1
 * (ISO-8859-1) characters and throws on anything outside that range (an
 * em dash, a non-ASCII asset name, etc.) — this encodes to real UTF-8
 * bytes first, then base64-encodes those bytes.
 */
export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
