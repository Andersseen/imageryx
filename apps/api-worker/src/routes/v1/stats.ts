import type {
  StatsResponse,
  SupportedImageMimeType,
} from "@imageryx/contracts";
import { Hono } from "hono";
import type { AppVariables } from "../../lib/app-variables";

export const statsRoute = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

interface CountRow {
  total: number;
}

/** A handful of aggregate `COUNT`/`SUM`/`GROUP BY` queries — never loads every row into the Worker to compute these in memory. */
statsRoute.get("/", async (c) => {
  const db = c.get("db");

  const [
    projectCount,
    activeAssetCount,
    deletedAssetCount,
    totalOriginalBytes,
    readyVariantCount,
    jobStatusCounts,
    assetsByFormat,
    assetsByProject,
    recentActivity,
  ] = await Promise.all([
    db.queryOne<CountRow>("SELECT COUNT(*) as total FROM projects"),
    db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM assets WHERE deleted_at IS NULL",
    ),
    db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM assets WHERE deleted_at IS NOT NULL",
    ),
    db.queryOne<CountRow>(
      "SELECT COALESCE(SUM(size_bytes), 0) as total FROM assets WHERE deleted_at IS NULL",
    ),
    db.queryOne<CountRow>(
      "SELECT COUNT(*) as total FROM variants WHERE status = 'ready'",
    ),
    db.query<{ status: string; count: number }>(
      "SELECT status, COUNT(*) as count FROM processing_jobs GROUP BY status",
    ),
    db.query<{ mime_type: string; count: number }>(
      "SELECT mime_type, COUNT(*) as count FROM assets WHERE deleted_at IS NULL GROUP BY mime_type",
    ),
    db.query<{ project_id: string; project_name: string; count: number }>(
      `SELECT assets.project_id as project_id, projects.name as project_name, COUNT(*) as count
         FROM assets INNER JOIN projects ON projects.id = assets.project_id
         WHERE assets.deleted_at IS NULL
         GROUP BY assets.project_id, projects.name`,
    ),
    db.query<{
      id: string;
      asset_id: string;
      project_id: string;
      event: string;
      created_at: string;
    }>(
      "SELECT id, asset_id, project_id, event, created_at FROM asset_activity ORDER BY created_at DESC LIMIT 20",
    ),
  ]);

  const jobStatusMap = new Map(
    jobStatusCounts.map((row) => [row.status, row.count]),
  );
  const pendingJobCount =
    (jobStatusMap.get("queued") ?? 0) + (jobStatusMap.get("processing") ?? 0);
  const failedJobCount = jobStatusMap.get("failed") ?? 0;

  const response: StatsResponse = {
    projectCount: projectCount?.total ?? 0,
    activeAssetCount: activeAssetCount?.total ?? 0,
    deletedAssetCount: deletedAssetCount?.total ?? 0,
    totalOriginalBytes: totalOriginalBytes?.total ?? 0,
    readyVariantCount: readyVariantCount?.total ?? 0,
    pendingJobCount,
    failedJobCount,
    assetsByFormat: assetsByFormat.map((row) => ({
      // A CHECK constraint on assets.mime_type already guarantees this column only ever holds a
      // supported MIME type — no separate re-validation needed just to satisfy the response type.
      mimeType: row.mime_type as SupportedImageMimeType,
      count: row.count,
    })),
    assetsByProject: assetsByProject.map((row) => ({
      projectId: row.project_id,
      projectName: row.project_name,
      count: row.count,
    })),
    recentActivity: recentActivity.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      projectId: row.project_id,
      event: row.event,
      createdAt: row.created_at,
    })),
  };

  return c.json(response);
});
