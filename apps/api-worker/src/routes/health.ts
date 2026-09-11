import type { HealthCheckResponse } from "@imageryx/contracts";
import { Hono } from "hono";
import type { AppVariables } from "../lib/app-variables";
import { VERSION } from "../version";

export const healthRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

healthRoute.get("/", (c) => {
  const body: HealthCheckResponse = {
    service: "api-worker",
    status: "healthy",
    environment: c.env.APP_ENV,
    version: VERSION,
    timestamp: new Date().toISOString(),
  };

  return c.json(body);
});

export interface ReadinessResponse {
  runtime: "cloudflare";
  database: "d1";
  status: "ready" | "unavailable";
}

/**
 * The Cloudflare side of the runtime/database parity `apps/self-hosted`
 * reports at its own `/health/ready` — a trivial reachability check via
 * the same `DatabaseClient` every route uses, never filesystem paths,
 * absolute database locations, credentials, or binding IDs.
 */
healthRoute.get("/ready", async (c) => {
  try {
    await c.get("db").query("SELECT 1");
    const body: ReadinessResponse = {
      runtime: "cloudflare",
      database: "d1",
      status: "ready",
    };
    return c.json(body);
  } catch {
    const body: ReadinessResponse = {
      runtime: "cloudflare",
      database: "d1",
      status: "unavailable",
    };
    return c.json(body, 503);
  }
});
