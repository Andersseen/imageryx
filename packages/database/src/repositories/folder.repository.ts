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

  async delete(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
  }
}
