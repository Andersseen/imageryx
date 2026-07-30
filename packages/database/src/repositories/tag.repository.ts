import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

interface TagRow {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

function mapRow(row: TagRow): Tag {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export class TagRepository {
  constructor(private readonly db: D1Client) {}

  async listByProject(projectId: string): Promise<Tag[]> {
    const result = await this.db
      .prepare("SELECT * FROM tags WHERE project_id = ? ORDER BY name ASC")
      .bind(projectId)
      .all<TagRow>();
    return result.results.map(mapRow);
  }

  async findByName(projectId: string, name: string): Promise<Tag | null> {
    const row = await this.db
      .prepare("SELECT * FROM tags WHERE project_id = ? AND name = ?")
      .bind(projectId, name)
      .first<TagRow>();
    return row ? mapRow(row) : null;
  }

  /** Idempotent: returns the existing tag if `name` is already registered for the project. */
  async findOrCreate(projectId: string, name: string): Promise<Tag> {
    const existing = await this.findByName(projectId, name);
    if (existing) return existing;

    const id = generateId();
    const timestamp = nowIso();
    await this.db
      .prepare(
        "INSERT INTO tags (id, project_id, name, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(id, projectId, name, timestamp)
      .run();
    return { id, projectId, name, createdAt: timestamp };
  }

  async setAssetTags(
    assetId: string,
    tagIds: readonly string[],
  ): Promise<void> {
    const timestamp = nowIso();
    const statements = [
      this.db
        .prepare("DELETE FROM asset_tags WHERE asset_id = ?")
        .bind(assetId),
      ...tagIds.map((tagId) =>
        this.db
          .prepare(
            "INSERT INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)",
          )
          .bind(assetId, tagId, timestamp),
      ),
    ];
    await this.db.batch(statements);
  }

  async listAssetTags(assetId: string): Promise<Tag[]> {
    const result = await this.db
      .prepare(
        "SELECT tags.* FROM tags INNER JOIN asset_tags ON asset_tags.tag_id = tags.id WHERE asset_tags.asset_id = ? ORDER BY tags.name ASC",
      )
      .bind(assetId)
      .all<TagRow>();
    return result.results.map(mapRow);
  }
}
