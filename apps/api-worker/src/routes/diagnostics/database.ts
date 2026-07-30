import { AssetRepository, ProjectRepository } from "@imageryx/database";
import { Hono } from "hono";
import type { RequestIdVariables } from "../../middleware/request-id";

export const databaseDiagnosticsRoute = new Hono<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>();

interface MigrationRow {
  name: string;
}

interface CountRow {
  total: number;
}

/**
 * Reports real local D1 state — migration history and row counts — never
 * a raw thrown error's message (which could include a SQL fragment or
 * internal detail); an unavailable database reports `available: false`
 * with a fixed, generic reason instead.
 */
databaseDiagnosticsRoute.get("/", async (c) => {
  try {
    const db = c.env.DB;

    const migrations = await db
      .prepare("SELECT name FROM d1_migrations ORDER BY id ASC")
      .all<MigrationRow>();
    const projectRepository = new ProjectRepository(db);
    const assetRepository = new AssetRepository(db);

    const projects = await projectRepository.list();

    let totalAssets = 0;
    for (const project of projects) {
      totalAssets += await assetRepository.count({
        projectId: project.id,
        deleted: "all",
        page: 1,
        pageSize: 1,
        sortField: "createdAt",
        sortDirection: "desc",
      });
    }

    const presetCountRow = await db
      .prepare("SELECT COUNT(*) as total FROM presets")
      .first<CountRow>();
    const folderCountRow = await db
      .prepare("SELECT COUNT(*) as total FROM folders")
      .first<CountRow>();
    const variantCountRow = await db
      .prepare("SELECT COUNT(*) as total FROM variants")
      .first<CountRow>();
    const processingJobCountRow = await db
      .prepare("SELECT COUNT(*) as total FROM processing_jobs")
      .first<CountRow>();

    return c.json({
      available: true,
      migrationsApplied: migrations.results.map((row) => row.name),
      projectCount: projects.length,
      folderCount: folderCountRow?.total ?? 0,
      assetCount: totalAssets,
      presetCount: presetCountRow?.total ?? 0,
      variantCount: variantCountRow?.total ?? 0,
      processingJobCount: processingJobCountRow?.total ?? 0,
    });
  } catch {
    return c.json(
      {
        available: false,
        reason: "local D1 database is not reachable or not migrated",
      },
      503,
    );
  }
});
