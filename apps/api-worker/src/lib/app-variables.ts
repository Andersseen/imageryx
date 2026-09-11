import type { DatabaseClient } from "@imageryx/database";
import type { RequestIdVariables } from "../middleware/request-id";

/**
 * Every route that touches the database reads it from Hono context
 * (`c.get("db")`), never from `c.env.DB` directly — the Cloudflare
 * entrypoint (`index.ts`) is the one place that constructs a
 * `D1DatabaseClient` from the real binding and sets it here, via one
 * middleware registered before any route. This is what lets
 * `../portable.ts`'s re-exported routes run unmodified against a
 * `SqliteDatabaseClient` in `apps/self-hosted` instead.
 */
export interface AppVariables extends RequestIdVariables {
  db: DatabaseClient;
}
