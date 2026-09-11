import type { DatabaseClient, DatabaseStatement } from "../client";
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
  constructor(private readonly db: DatabaseClient) {}

  async listByProject(projectId: string): Promise<Tag[]> {
    const results = await this.db.query<TagRow>(
      "SELECT * FROM tags WHERE project_id = ? ORDER BY name ASC",
      [projectId],
    );
    return results.map(mapRow);
  }

  async findByName(projectId: string, name: string): Promise<Tag | null> {
    const row = await this.db.queryOne<TagRow>(
      "SELECT * FROM tags WHERE project_id = ? AND name = ?",
      [projectId, name],
    );
    return row ? mapRow(row) : null;
  }

  async findById(id: string): Promise<Tag | null> {
    const row = await this.db.queryOne<TagRow>(
      "SELECT * FROM tags WHERE id = ?",
      [id],
    );
    return row ? mapRow(row) : null;
  }

  async rename(id: string, name: string): Promise<Tag | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.db.execute("UPDATE tags SET name = ? WHERE id = ?", [name, id]);
    return { ...existing, name };
  }

  async delete(id: string): Promise<void> {
    await this.db.execute("DELETE FROM tags WHERE id = ?", [id]);
  }

  /** One join instead of one query per asset — used by the asset list endpoint. */
  async listForAssets(
    assetIds: readonly string[],
  ): Promise<Map<string, Tag[]>> {
    const map = new Map<string, Tag[]>();
    if (assetIds.length === 0) return map;
    const placeholders = assetIds.map(() => "?").join(", ");
    const results = await this.db.query<TagRow & { asset_id: string }>(
      `SELECT asset_tags.asset_id as asset_id, tags.* FROM tags
         INNER JOIN asset_tags ON asset_tags.tag_id = tags.id
         WHERE asset_tags.asset_id IN (${placeholders})
         ORDER BY tags.name ASC`,
      assetIds,
    );
    for (const row of results) {
      const list = map.get(row.asset_id) ?? [];
      list.push(mapRow(row));
      map.set(row.asset_id, list);
    }
    return map;
  }

  /** Idempotent: returns the existing tag if `name` is already registered for the project. */
  async findOrCreate(projectId: string, name: string): Promise<Tag> {
    const existing = await this.findByName(projectId, name);
    if (existing) return existing;

    const id = generateId();
    const timestamp = nowIso();
    await this.db.execute(
      "INSERT INTO tags (id, project_id, name, created_at) VALUES (?, ?, ?, ?)",
      [id, projectId, name, timestamp],
    );
    return { id, projectId, name, createdAt: timestamp };
  }

  async setAssetTags(
    assetId: string,
    tagIds: readonly string[],
  ): Promise<void> {
    const timestamp = nowIso();
    const statements: DatabaseStatement[] = [
      { sql: "DELETE FROM asset_tags WHERE asset_id = ?", params: [assetId] },
      ...tagIds.map((tagId) => ({
        sql: "INSERT INTO asset_tags (asset_id, tag_id, created_at) VALUES (?, ?, ?)",
        params: [assetId, tagId, timestamp],
      })),
    ];
    await this.db.batch(statements);
  }

  async listAssetTags(assetId: string): Promise<Tag[]> {
    const results = await this.db.query<TagRow>(
      "SELECT tags.* FROM tags INNER JOIN asset_tags ON asset_tags.tag_id = tags.id WHERE asset_tags.asset_id = ? ORDER BY tags.name ASC",
      [assetId],
    );
    return results.map(mapRow);
  }
}
