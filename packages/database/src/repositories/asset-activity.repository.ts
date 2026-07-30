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
