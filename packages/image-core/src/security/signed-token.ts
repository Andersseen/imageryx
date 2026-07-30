/**
 * HMAC-SHA256 signed tokens for time-limited download links, shared by
 * `api-worker` (issues tokens) and `delivery-worker` (verifies them) so the
 * two never drift out of sync on format. Never a bare base64-encoded JSON
 * blob — every payload is signed, and verification always checks the
 * signature before trusting anything decoded from it.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Copies into a plain, non-generic `ArrayBuffer` before any `crypto.subtle`
 * call: DOM lib types `SubtleCrypto` methods to require `ArrayBufferView<ArrayBuffer>`,
 * which a bare `Uint8Array` (generically `Uint8Array<ArrayBufferLike>`) doesn't
 * always satisfy depending on which lib version a *consuming* app's tsconfig
 * pulls in (see `checksum.ts`'s identical workaround and context.md's
 * "Cross-runtime ambient type friction" note).
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

// No explicit `Promise<CryptoKey>` return annotation: `CryptoKey` is a Web
// Crypto ambient type that isn't resolvable under every consuming
// package's own `lib` setting (Node-only tsconfigs with no "dom" lib —
// see context.md's "Cross-runtime ambient type friction" note). Omitting
// the annotation lets each consumer's own ambient ImportKey overload infer
// the return type structurally instead.
async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SignedTokenPayload extends Record<string, unknown> {
  /** Unix seconds. */
  exp: number;
}

export async function createSignedToken(
  payload: SignedTokenPayload,
  secret: string,
): Promise<string> {
  const payloadB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(new TextEncoder().encode(payloadB64)),
  );
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export type VerifySignedTokenResult<T extends SignedTokenPayload> =
  | { valid: true; expired: boolean; payload: T }
  | { valid: false; expired: false; payload: null };

/**
 * Verifies the signature first (via `crypto.subtle.verify`, which performs
 * a constant-time comparison internally) before any payload field —
 * including expiry — is trusted. A malformed token, a bad signature, and
 * an expired-but-validly-signed token are all distinguishable results so
 * callers can return the right error code without re-deriving them.
 */
export async function verifySignedToken<T extends SignedTokenPayload>(
  token: string,
  secret: string,
): Promise<VerifySignedTokenResult<T>> {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, expired: false, payload: null };
  const [payloadB64, signatureB64] = parts as [string, string];

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64UrlDecode(signatureB64);
  } catch {
    return { valid: false, expired: false, payload: null };
  }

  const key = await importHmacKey(secret);
  const signatureIsValid = await crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(signatureBytes),
    toArrayBuffer(new TextEncoder().encode(payloadB64)),
  );
  if (!signatureIsValid) return { valid: false, expired: false, payload: null };

  let payload: T;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        base64UrlDecode(payloadB64),
      ),
    ) as T;
  } catch {
    return { valid: false, expired: false, payload: null };
  }

  if (typeof payload.exp !== "number") {
    return { valid: false, expired: false, payload: null };
  }

  const expired = payload.exp * 1000 < Date.now();
  return { valid: true, expired, payload };
}
