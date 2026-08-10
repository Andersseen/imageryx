/**
 * PKCE (RFC 7636) and random-token primitives, built on Web Crypto only —
 * `crypto.getRandomValues` and `crypto.subtle.digest` exist in both runtimes this
 * server code targets (Node 22 for `vite`/Nitro dev, the Cloudflare Pages Worker
 * for a built deployment), so nothing here needs a Node-only import.
 *
 * DevAuth rejects `code_challenge_method=plain` with a 400 before it will even
 * redirect, so S256 is the only method implemented.
 */

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`: the default type parameter
// is `ArrayBufferLike`, which admits `SharedArrayBuffer` and so is not assignable
// to the `BufferSource` that Web Crypto's verify/digest expect.
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 32 random bytes rendered as base64url — 43 characters, comfortably inside
 * RFC 7636's 43..128 range for a code verifier and equally suitable for the
 * `state` and `nonce` values, which only need to be unguessable.
 */
export function randomUrlSafeToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export const createCodeVerifier = (): string => randomUrlSafeToken(32);
export const createState = (): string => randomUrlSafeToken(32);
export const createNonce = (): string => randomUrlSafeToken(32);

/** S256: base64url(SHA-256(ASCII(verifier))), unpadded. */
export async function computeCodeChallengeS256(
  verifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}
