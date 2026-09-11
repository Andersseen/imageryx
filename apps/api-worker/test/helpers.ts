import {
  createD1DatabaseClient,
  type DatabaseClient,
} from "@imageryx/database";
import { env } from "cloudflare:test";

/** Every `/v1/*` route requires this header — see src/middleware/auth.ts. */
export function authHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { Authorization: `Bearer ${env.IMAGERYX_API_KEY}`, ...extra };
}

/** Wraps the real Miniflare-backed D1 test binding as a `DatabaseClient` — repositories no longer accept a raw `D1Database`. */
export function testDb(): DatabaseClient {
  return createD1DatabaseClient(env.DB);
}
