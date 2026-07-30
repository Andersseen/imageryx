import { env } from "cloudflare:test";

/** Every `/v1/*` route requires this header — see src/middleware/auth.ts. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${env.IMAGERYX_API_KEY}`, ...extra };
}
