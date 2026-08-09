import { base64UrlDecode, base64UrlEncode } from "./pkce";

/**
 * `<base64url(json payload)>.<base64url(HMAC-SHA256 of that first segment)>`.
 *
 * Deliberately not a JWT: nothing outside this app ever reads these tokens, so
 * there is no interoperability to buy with a JOSE header, and a fixed algorithm
 * means there is no `alg` field an attacker could try to talk us down from.
 *
 * Verification goes through `crypto.subtle.verify`, never a string comparison of
 * two signatures — a `===` on the hex/base64 signature short-circuits at the
 * first differing byte and leaks, through timing, how much of a forged signature
 * was correct.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(
  payload: unknown,
  secret: string,
): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the payload, or `null` for anything that is not a well-formed token
 * carrying a valid signature. Every failure mode collapses to `null` on purpose:
 * a caller that cannot tell "malformed" from "bad signature" cannot accidentally
 * branch on the difference, and the browser learns nothing either way.
 */
export async function readSignedToken<T>(
  token: string | undefined | null,
  secret: string,
): Promise<T | null> {
  if (!token) return null;

  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  try {
    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    return JSON.parse(decoder.decode(base64UrlDecode(body))) as T;
  } catch {
    return null;
  }
}
