import { PresetRepository, ProjectRepository } from "@imageryx/database";
import { Hono } from "hono";
import type { AppVariables } from "../../lib/app-variables";

export const seedDiagnosticsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

interface CountRow {
  total: number;
}

/**
 * A business-level view of seed state (which named seed projects exist,
 * how many system presets they carry) — `diagnostics/database` reports
 * raw table counts, this reports whether `pnpm db:seed:local` has
 * actually run.
 */
seedDiagnosticsRoute.get("/", async (c) => {
  try {
    const db = c.get("db");
    const projectRepository = new ProjectRepository(db);
    const presetRepository = new PresetRepository(db);

    const projects = await projectRepository.list();
    let systemPresetCount = 0;
    for (const project of projects) {
      const presets = await presetRepository.listByProject(project.id);
      systemPresetCount += presets.filter((preset) => preset.isSystem).length;
    }

    const assetCountRow = await db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM assets",
    );

    return c.json({
      seeded: projects.length > 0,
      seedProjectCount: projects.length,
      seedProjectSlugs: projects.map((project) => project.slug),
      systemPresetCount,
      assetCount: assetCountRow?.total ?? 0,
    });
  } catch {
    return c.json(
      {
        seeded: false,
        reason: "local D1 database is not reachable or not migrated",
      },
      503,
    );
  }
});
