import { type Folder, folderSchema } from "@imageryx/contracts";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

interface FolderRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  path: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: FolderRow): Folder {
  return folderSchema.parse({
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreateFolderRow {
  projectId: string;
  parentId?: string | null;
  name: string;
  slug: string;
  path: string;
}

export class FolderRepository {
  constructor(private readonly db: D1Client) {}

  async listByProject(projectId: string): Promise<Folder[]> {
    const result = await this.db
      .prepare("SELECT * FROM folders WHERE project_id = ? ORDER BY path ASC")
      .bind(projectId)
      .all<FolderRow>();
    return result.results.map(mapRow);
  }

  async listByParent(
    projectId: string,
    parentId: string | null,
  ): Promise<Folder[]> {
    const result = await (
      parentId === null
        ? this.db
            .prepare(
              "SELECT * FROM folders WHERE project_id = ? AND parent_id IS NULL ORDER BY name ASC",
            )
            .bind(projectId)
        : this.db
            .prepare(
              "SELECT * FROM folders WHERE project_id = ? AND parent_id = ? ORDER BY name ASC",
            )
            .bind(projectId, parentId)
    ).all<FolderRow>();
    return result.results.map(mapRow);
  }

  async findById(id: string): Promise<Folder | null> {
    const row = await this.db
      .prepare("SELECT * FROM folders WHERE id = ?")
      .bind(id)
      .first<FolderRow>();
    return row ? mapRow(row) : null;
  }

  async findByPath(projectId: string, path: string): Promise<Folder | null> {
    const row = await this.db
      .prepare("SELECT * FROM folders WHERE project_id = ? AND path = ?")
      .bind(projectId, path)
      .first<FolderRow>();
    return row ? mapRow(row) : null;
  }

  async create(input: CreateFolderRow): Promise<Folder> {
    const id = generateId();
    const timestamp = nowIso();
    await this.db
      .prepare(
        "INSERT INTO folders (id, project_id, parent_id, name, slug, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        input.projectId,
        input.parentId ?? null,
        input.name,
        input.slug,
        input.path,
        timestamp,
        timestamp,
      )
      .run();

    return {
      id,
      projectId: input.projectId,
      parentId: input.parentId ?? null,
      name: input.name,
      slug: input.slug,
      path: input.path,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async rename(id: string, name: string): Promise<Folder | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const timestamp = nowIso();
    await this.db
      .prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?")
      .bind(name, timestamp, id)
      .run();
    return { ...existing, name, updatedAt: timestamp };
  }

  /** All folders whose `path` is the given folder or one of its descendants — used to cascade a path rewrite on move without unbounded recursive queries (a single prefix-match query covers the whole subtree). */
  async listSubtree(projectId: string, path: string): Promise<Folder[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM folders WHERE project_id = ? AND (path = ? OR path LIKE ?) ORDER BY path ASC",
      )
      .bind(projectId, path, `${path}/%`)
      .all<FolderRow>();
    return result.results.map(mapRow);
  }

  /**
   * Moves a folder to a new parent (or to the root when `newParentId` is
   * `null`), recomputing its `path` and cascading the same prefix rewrite
   * to every descendant folder's `path` in one batch. Never touches
   * `assets.path` — see context.md's "Folder move" note for why an
   * asset's own path is a stable value independent of its containing
   * folder's current location, exactly like a project slug change leaves
   * physical storage keys untouched.
   */
  async move(id: string, newParentId: string | null): Promise<Folder | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const newParent = newParentId ? await this.findById(newParentId) : null;
    const newParentPath = newParent ? newParent.path : "";
    const newPath = newParentPath ? `${newParentPath}/${existing.slug}` : existing.slug;

    if (newPath === existing.path && newParentId === existing.parentId) {
      return existing;
    }

    const subtree = await this.listSubtree(existing.projectId, existing.path);
    const timestamp = nowIso();

    const statements = subtree.map((folder) => {
      const rewritten =
        folder.id === id
          ? newPath
          : newPath + folder.path.slice(existing.path.length);
      return this.db
        .prepare(
          folder.id === id
            ? "UPDATE folders SET parent_id = ?, path = ?, updated_at = ? WHERE id = ?"
            : "UPDATE folders SET path = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          ...(folder.id === id
            ? [newParentId, rewritten, timestamp, folder.id]
            : [rewritten, timestamp, folder.id]),
        );
    });

    await this.db.batch(statements);
    return { ...existing, parentId: newParentId, path: newPath, updatedAt: timestamp };
  }

  async listByIds(ids: readonly string[]): Promise<Folder[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const result = await this.db
      .prepare(`SELECT * FROM folders WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<FolderRow>();
    return result.results.map(mapRow);
  }

  async countByProjectIds(
    projectIds: readonly string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (projectIds.length === 0) return map;
    const placeholders = projectIds.map(() => "?").join(", ");
    const result = await this.db
      .prepare(
        `SELECT project_id, COUNT(*) as count FROM folders WHERE project_id IN (${placeholders}) GROUP BY project_id`,
      )
      .bind(...projectIds)
      .all<{ project_id: string; count: number }>();
    for (const row of result.results) map.set(row.project_id, row.count);
    return map;
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
  }
}
