const RANDOM_BYTES = 24;
const API_KEY_PREFIX_LENGTH = 16;

export type ApiKeyEnvironment = "dev" | "live";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createApiKey(environment: ApiKeyEnvironment): {
  key: string;
  prefix: string;
} {
  const bytes = new Uint8Array(RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const key = `imgx_${environment}_${toHex(bytes)}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX_LENGTH) };
}

export function extractApiKeyPrefix(key: string): string | null {
  if (!/^imgx_(dev|live)_[a-f0-9]{48}$/.test(key)) return null;
  return key.slice(0, API_KEY_PREFIX_LENGTH);
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return toHex(new Uint8Array(digest));
}
