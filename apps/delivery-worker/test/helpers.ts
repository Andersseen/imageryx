import {
  createD1DatabaseClient,
  type DatabaseClient,
} from "@imageryx/database";
import { env } from "cloudflare:test";

/** Wraps the real Miniflare-backed D1 test binding as a `DatabaseClient` — repositories no longer accept a raw `D1Database`. */
export function testDb(): DatabaseClient {
  return createD1DatabaseClient(env.DB);
}
