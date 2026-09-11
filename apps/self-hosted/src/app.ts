import type { HealthCheckResponse } from "@imageryx/contracts";
import {
  errorHandler,
  notFoundHandler,
  projectsRoute,
  requestId,
  structuredLogger,
  type AppVariables,
} from "@imageryx/api-worker/portable";
import type { DatabaseClient } from "@imageryx/database";
import { Hono } from "hono";
import { VERSION } from "./version";

export interface ReadinessResponse {
  runtime: "node";
  database: "sqlite";
  status: "ready" | "unavailable";
}

export interface CreateSelfHostedAppOptions {
  db: DatabaseClient;
  appEnv: "development" | "production";
}

/**
 * The minimal proof application (see ROADMAP.md's Self-host Phase A): every
 * middleware and the `/v1/projects` route are the real, unmodified pieces
 * `apps/api-worker` uses in production, imported from its `./portable`
 * subpath — only the database adapter differs (`SqliteDatabaseClient`
 * instead of `D1DatabaseClient`, injected here as `db`). Routes needing R2,
 * Queues, or Cloudflare Images (assets, processing-jobs, stats, presets,
 * tags, api-keys) are deliberately not mounted — this proves the
 * architecture, it does not pretend uploads/processing work self-hosted
 * yet.
 */
export function createSelfHostedApp({
  db,
  appEnv,
}: CreateSelfHostedAppOptions) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestId);
  app.use("*", structuredLogger);
  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.get("/health", (c) => {
    const body: HealthCheckResponse = {
      service: "self-hosted",
      status: "healthy",
      environment: appEnv,
      version: VERSION,
      timestamp: new Date().toISOString(),
    };
    return c.json(body);
  });

  // Cloudflare's equivalent readiness check lives at api-worker's own `/health/ready` (see
  // apps/api-worker/src/routes/health.ts) — same shape, `runtime`/`database` swapped, so a
  // client can tell which backend it's talking to without inspecting anything else.
  app.get("/health/ready", async (c) => {
    try {
      await c.get("db").query("SELECT 1");
      const body: ReadinessResponse = {
        runtime: "node",
        database: "sqlite",
        status: "ready",
      };
      return c.json(body);
    } catch {
      const body: ReadinessResponse = {
        runtime: "node",
        database: "sqlite",
        status: "unavailable",
      };
      return c.json(body, 503);
    }
  });

  app.route("/v1/projects", projectsRoute);

  return app;
}
