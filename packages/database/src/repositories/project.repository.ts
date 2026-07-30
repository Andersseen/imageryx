import { type Project, projectSchema } from "@imageryx/contracts";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProjectRow): Project {
  return projectSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreateProjectRow {
  name: string;
  slug: string;
  description?: string | null;
  isDefault?: boolean;
}

export interface UpdateProjectRow {
  name?: string;
  description?: string | null;
  isDefault?: boolean;
}

export class ProjectRepository {
  constructor(private readonly db: D1Client) {}

  async list(): Promise<Project[]> {
    const result = await this.db
      .prepare("SELECT * FROM projects ORDER BY created_at ASC")
      .all<ProjectRow>();
    return result.results.map(mapRow);
  }

  async findById(id: string): Promise<Project | null> {
    const row = await this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .bind(id)
      .first<ProjectRow>();
    return row ? mapRow(row) : null;
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const row = await this.db
      .prepare("SELECT * FROM projects WHERE slug = ?")
      .bind(slug)
      .first<ProjectRow>();
    return row ? mapRow(row) : null;
  }

  async create(input: CreateProjectRow): Promise<Project> {
    const id = generateId();
    const timestamp = nowIso();
    await this.db
      .prepare(
        "INSERT INTO projects (id, name, slug, description, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        input.name,
        input.slug,
        input.description ?? null,
        input.isDefault ? 1 : 0,
        timestamp,
        timestamp,
      )
      .run();

    return {
      id,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      isDefault: input.isDefault ?? false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async update(id: string, input: UpdateProjectRow): Promise<Project | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const timestamp = nowIso();
    const name = input.name ?? existing.name;
    const description =
      input.description !== undefined
        ? input.description
        : existing.description;
    const isDefault = input.isDefault ?? existing.isDefault;

    await this.db
      .prepare(
        "UPDATE projects SET name = ?, description = ?, is_default = ?, updated_at = ? WHERE id = ?",
      )
      .bind(name, description, isDefault ? 1 : 0, timestamp, id)
      .run();

    return { ...existing, name, description, isDefault, updatedAt: timestamp };
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
  }
}
