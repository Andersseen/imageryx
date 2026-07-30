import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

export interface AssetActivity {
  id: string;
  assetId: string;
  projectId: string;
  event: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AssetActivityRow {
  id: string;
  asset_id: string;
  project_id: string;
  event: string;
  metadata: string | null;
  created_at: string;
}

function mapRow(row: AssetActivityRow): AssetActivity {
  return {
    id: row.id,
    assetId: row.asset_id,
    projectId: row.project_id,
    event: row.event,
    metadata:
      row.metadata === null
        ? null
        : (JSON.parse(row.metadata) as Record<string, unknown>),
    createdAt: row.created_at,
  };
}

export interface RecordAssetActivityInput {
  assetId: string;
  projectId: string;
  event: string;
  metadata?: Record<string, unknown> | null;
}

export class AssetActivityRepository {
  constructor(private readonly db: D1Client) {}

  async listByAsset(assetId: string): Promise<AssetActivity[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM asset_activity WHERE asset_id = ? ORDER BY created_at DESC",
      )
      .bind(assetId)
      .all<AssetActivityRow>();
    return result.results.map(mapRow);
  }

  async listByProject(projectId: string): Promise<AssetActivity[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM asset_activity WHERE project_id = ? ORDER BY created_at DESC",
      )
      .bind(projectId)
      .all<AssetActivityRow>();
    return result.results.map(mapRow);
  }

  async listRecent(limit: number): Promise<AssetActivity[]> {
    const result = await this.db
      .prepare("SELECT * FROM asset_activity ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<AssetActivityRow>();
    return result.results.map(mapRow);
  }

  /** Most recent activity row per project, in one query — used by the project list endpoint's "latest activity" summary. Ties (identical timestamps) resolve to an arbitrary but stable row. */
  async latestByProjectIds(
    projectIds: readonly string[],
  ): Promise<Map<string, AssetActivity>> {
    const map = new Map<string, AssetActivity>();
    if (projectIds.length === 0) return map;
    const placeholders = projectIds.map(() => "?").join(", ");
    const result = await this.db
      .prepare(
        `SELECT aa.* FROM asset_activity aa
         INNER JOIN (
           SELECT project_id, MAX(created_at) as max_created_at
           FROM asset_activity WHERE project_id IN (${placeholders})
           GROUP BY project_id
         ) latest ON latest.project_id = aa.project_id AND latest.max_created_at = aa.created_at`,
      )
      .bind(...projectIds)
      .all<AssetActivityRow>();
    for (const row of result.results) {
      const mapped = mapRow(row);
      if (!map.has(mapped.projectId)) map.set(mapped.projectId, mapped);
    }
    return map;
  }

  /** Unexecuted counterpart to `record()`, for combining with another repository's statement in a `db.batch()` call. */
  buildInsertStatement(
    id: string,
    input: RecordAssetActivityInput,
    timestamp: string,
  ) {
    return this.db
      .prepare(
        "INSERT INTO asset_activity (id, asset_id, project_id, event, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        input.assetId,
        input.projectId,
        input.event,
        input.metadata ? JSON.stringify(input.metadata) : null,
        timestamp,
      );
  }

  async record(input: RecordAssetActivityInput): Promise<AssetActivity> {
    const id = generateId();
    const timestamp = nowIso();
    await this.buildInsertStatement(id, input, timestamp).run();

    return {
      id,
      assetId: input.assetId,
      projectId: input.projectId,
      event: input.event,
      metadata: input.metadata ?? null,
      createdAt: timestamp,
    };
  }
}
