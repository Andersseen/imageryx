import { AssetRepository, ProjectRepository } from "@imageryx/database";
import { Hono } from "hono";
import type { AppVariables } from "../../lib/app-variables";

export const databaseDiagnosticsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
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
    // `d1_migrations` is a wrangler-internal, D1-only bookkeeping table — this is the one place
    // in this route that stays tied to the real Cloudflare binding rather than the portable
    // `DatabaseClient` (`c.get("db")`, used for every repository call below). A self-hosted SQLite
    // deployment has its own equivalent (`_imageryx_migrations`, see `@imageryx/database/node`)
    // but this diagnostics route is Cloudflare-only and was never claimed to be portable.
    const rawD1 = c.env.DB;
    const db = c.get("db");

    const migrations = await rawD1
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

    const presetCountRow = await db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM presets",
    );
    const folderCountRow = await db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM folders",
    );
    const variantCountRow = await db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM variants",
    );
    const processingJobCountRow = await db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM processing_jobs",
    );

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
