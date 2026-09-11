import { type Folder, folderSchema } from "@imageryx/contracts";
import type { DatabaseClient, DatabaseStatement } from "../client";
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
  constructor(private readonly db: DatabaseClient) {}

  async listByProject(projectId: string): Promise<Folder[]> {
    const results = await this.db.query<FolderRow>(
      "SELECT * FROM folders WHERE project_id = ? ORDER BY path ASC",
      [projectId],
    );
    return results.map(mapRow);
  }

  async listByParent(
    projectId: string,
    parentId: string | null,
  ): Promise<Folder[]> {
    const results =
      parentId === null
        ? await this.db.query<FolderRow>(
            "SELECT * FROM folders WHERE project_id = ? AND parent_id IS NULL ORDER BY name ASC",
            [projectId],
          )
        : await this.db.query<FolderRow>(
            "SELECT * FROM folders WHERE project_id = ? AND parent_id = ? ORDER BY name ASC",
            [projectId, parentId],
          );
    return results.map(mapRow);
  }

  async findById(id: string): Promise<Folder | null> {
    const row = await this.db.queryOne<FolderRow>(
      "SELECT * FROM folders WHERE id = ?",
      [id],
    );
    return row ? mapRow(row) : null;
  }

  async findByPath(projectId: string, path: string): Promise<Folder | null> {
    const row = await this.db.queryOne<FolderRow>(
      "SELECT * FROM folders WHERE project_id = ? AND path = ?",
      [projectId, path],
    );
    return row ? mapRow(row) : null;
  }

  async create(input: CreateFolderRow): Promise<Folder> {
    const id = generateId();
    const timestamp = nowIso();
    await this.db.execute(
      "INSERT INTO folders (id, project_id, parent_id, name, slug, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        input.projectId,
        input.parentId ?? null,
        input.name,
        input.slug,
        input.path,
        timestamp,
        timestamp,
      ],
    );

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
    await this.db.execute(
      "UPDATE folders SET name = ?, updated_at = ? WHERE id = ?",
      [name, timestamp, id],
    );
    return { ...existing, name, updatedAt: timestamp };
  }

  /** All folders whose `path` is the given folder or one of its descendants — used to cascade a path rewrite on move without unbounded recursive queries (a single prefix-match query covers the whole subtree). */
  async listSubtree(projectId: string, path: string): Promise<Folder[]> {
    const results = await this.db.query<FolderRow>(
      "SELECT * FROM folders WHERE project_id = ? AND (path = ? OR path LIKE ?) ORDER BY path ASC",
      [projectId, path, `${path}/%`],
    );
    return results.map(mapRow);
  }

  /**
   * Builds the folder side of a move's cascading path rewrite, without
   * executing it — used directly by `move()` below and combined with the
   * asset-path rewrite statements in
   * `FolderPersistenceService.moveFolderWithDescendants` for one atomic
   * `db.batch()` across both tables. Returns `null` alongside the moved
   * folder's resolved would-be state when nothing actually changes.
   */
  async buildMoveStatements(
    id: string,
    newParentId: string | null,
  ): Promise<{
    existing: Folder;
    moved: Folder;
    statements: DatabaseStatement[];
  } | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const newParent = newParentId ? await this.findById(newParentId) : null;
    const newParentPath = newParent ? newParent.path : "";
    const newPath = newParentPath
      ? `${newParentPath}/${existing.slug}`
      : existing.slug;

    if (newPath === existing.path && newParentId === existing.parentId) {
      return { existing, moved: existing, statements: [] };
    }

    const subtree = await this.listSubtree(existing.projectId, existing.path);
    const timestamp = nowIso();

    const statements: DatabaseStatement[] = subtree.map((folder) => {
      const rewritten =
        folder.id === id
          ? newPath
          : newPath + folder.path.slice(existing.path.length);
      return folder.id === id
        ? {
            sql: "UPDATE folders SET parent_id = ?, path = ?, updated_at = ? WHERE id = ?",
            params: [newParentId, rewritten, timestamp, folder.id],
          }
        : {
            sql: "UPDATE folders SET path = ?, updated_at = ? WHERE id = ?",
            params: [rewritten, timestamp, folder.id],
          };
    });

    return {
      existing,
      moved: {
        ...existing,
        parentId: newParentId,
        path: newPath,
        updatedAt: timestamp,
      },
      statements,
    };
  }

  /**
   * Moves a folder to a new parent (or to the root when `newParentId` is
   * `null`), recomputing its `path` and cascading the same prefix rewrite
   * to every descendant folder's `path` in one batch. Never touches
   * `assets.path` — callers that need the descendant-asset cascade too
   * (every real caller) should use `FolderPersistenceService.moveFolderWithDescendants`
   * instead, which builds on `buildMoveStatements` above.
   */
  async move(id: string, newParentId: string | null): Promise<Folder | null> {
    const built = await this.buildMoveStatements(id, newParentId);
    if (!built) return null;
    if (built.statements.length > 0) {
      await this.db.batch(built.statements);
    }
    return built.moved;
  }

  async listByIds(ids: readonly string[]): Promise<Folder[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const results = await this.db.query<FolderRow>(
      `SELECT * FROM folders WHERE id IN (${placeholders})`,
      ids,
    );
    return results.map(mapRow);
  }

  async countByProjectIds(
    projectIds: readonly string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (projectIds.length === 0) return map;
    const placeholders = projectIds.map(() => "?").join(", ");
    const results = await this.db.query<{ project_id: string; count: number }>(
      `SELECT project_id, COUNT(*) as count FROM folders WHERE project_id IN (${placeholders}) GROUP BY project_id`,
      projectIds,
    );
    for (const row of results) map.set(row.project_id, row.count);
    return map;
  }

  async delete(id: string): Promise<void> {
    await this.db.execute("DELETE FROM folders WHERE id = ?", [id]);
  }
}
