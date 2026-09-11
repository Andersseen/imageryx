import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import {
  createSqliteDatabaseClient,
  runSelfHostedMigrations,
} from "@imageryx/database/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSelfHostedApp } from "../src/app";

/**
 * Boots the real Node runtime (no database mocks — a real temp SQLite
 * file, migrated the same way `pnpm db:migrate:self-hosted` migrates one)
 * on an ephemeral port and drives it over real HTTP, proving the
 * architecture end to end: health, readiness, and project CRUD through
 * the same `projectsRoute` api-worker uses in production.
 */
describe("self-hosted Node runtime", () => {
  const dir = mkdtempSync(join(tmpdir(), "imageryx-self-hosted-test-"));
  const dbPath = join(dir, "test.db");
  let server: ServerType;
  let baseUrl: string;

  beforeAll(async () => {
    await runSelfHostedMigrations(dbPath);
    const db = createSqliteDatabaseClient(dbPath);
    const app = createSelfHostedApp({ db, appEnv: "development" });

    await new Promise<void>((resolveReady) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        baseUrl = `http://localhost:${info.port}`;
        resolveReady();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolveClosed) =>
      server.close(() => resolveClosed()),
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /health reports a healthy self-hosted service", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ service: "self-hosted", status: "healthy" });
  });

  it("GET /health/ready reports the node/sqlite runtime as ready", async () => {
    const response = await fetch(`${baseUrl}/health/ready`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      runtime: "node",
      database: "sqlite",
      status: "ready",
    });
  });

  let createdProjectId: string;

  it("POST /v1/projects creates a real project through the real api-worker route", async () => {
    const response = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Self-Hosted Test",
        slug: "self-hosted-test",
      }),
    });
    expect(response.status).toBe(201);
    const project = (await response.json()) as {
      id: string;
      name: string;
      slug: string;
    };
    expect(project).toMatchObject({
      name: "Self-Hosted Test",
      slug: "self-hosted-test",
    });
    createdProjectId = project.id;
  });

  it("GET /v1/projects lists the created project", async () => {
    const response = await fetch(`${baseUrl}/v1/projects`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { id: string }[] };
    expect(body.items.some((item) => item.id === createdProjectId)).toBe(true);
  });

  it("GET /v1/projects/:id returns the created project", async () => {
    const response = await fetch(`${baseUrl}/v1/projects/${createdProjectId}`);
    expect(response.status).toBe(200);
    const project = (await response.json()) as { slug: string };
    expect(project.slug).toBe("self-hosted-test");
  });

  it("data survives a process restart (the same SQLite file, reopened by a fresh app instance)", async () => {
    await new Promise<void>((resolveClosed) =>
      server.close(() => resolveClosed()),
    );

    const reopenedDb = createSqliteDatabaseClient(dbPath);
    const reopenedApp = createSelfHostedApp({
      db: reopenedDb,
      appEnv: "development",
    });

    await new Promise<void>((resolveReady) => {
      server = serve({ fetch: reopenedApp.fetch, port: 0 }, (info) => {
        baseUrl = `http://localhost:${info.port}`;
        resolveReady();
      });
    });

    const response = await fetch(`${baseUrl}/v1/projects/${createdProjectId}`);
    expect(response.status).toBe(200);
    const project = (await response.json()) as { slug: string };
    expect(project.slug).toBe("self-hosted-test");
  });
});
