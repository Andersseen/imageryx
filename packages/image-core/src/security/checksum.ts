/**
 * Uses the Web Crypto `crypto.subtle` API rather than Node's `Buffer`/
 * `node:crypto` module: `crypto.subtle` is available as a global in both
 * Node 22+ and the Workers runtime, so this is the one implementation
 * shared by `processing-worker` (Workers) and local scripts/tests (Node)
 * instead of two incompatible ones.
 */
function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function computeSha256Checksum(
  bytes: Uint8Array,
): Promise<string> {
  // Copied into a plain, non-generic ArrayBuffer: TypeScript's DOM lib types `crypto.subtle.digest`
  // to require `ArrayBufferView<ArrayBuffer>`, which a bare `Uint8Array` (generically
  // `Uint8Array<ArrayBufferLike>`) doesn't always satisfy depending on which lib version a
  // *consuming* app's tsconfig pulls in — this side-steps that entirely.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}
