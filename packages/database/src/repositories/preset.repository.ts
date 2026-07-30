import {
  type ImagePreset,
  presetOperationsSchema,
  presetSchema,
} from "@imageryx/contracts";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

interface PresetRow {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  operations: string;
  output_format: string;
  quality: number | null;
  is_system: number;
  created_at: string;
  updated_at: string;
}

/** Never trusts the stored JSON blindly: `operations` is re-validated against the same schema used to accept it on write. */
function mapRow(row: PresetRow): ImagePreset {
  const parsedOperations: unknown = JSON.parse(row.operations);
  return presetSchema.parse({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    operations: presetOperationsSchema.parse(parsedOperations),
    outputFormat: row.output_format,
    quality: row.quality,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreatePresetRow {
  projectId: string;
  name: string;
  slug: string;
  description?: string | null;
  operations: ImagePreset["operations"];
  outputFormat: ImagePreset["outputFormat"];
  quality?: number | null;
  isSystem?: boolean;
}

export class SystemPresetDeletionError extends Error {}

export class PresetRepository {
  constructor(private readonly db: D1Client) {}

  async listByProject(projectId: string): Promise<ImagePreset[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM presets WHERE project_id = ? ORDER BY created_at ASC",
      )
      .bind(projectId)
      .all<PresetRow>();
    return result.results.map(mapRow);
  }

  async findById(id: string): Promise<ImagePreset | null> {
    const row = await this.db
      .prepare("SELECT * FROM presets WHERE id = ?")
      .bind(id)
      .first<PresetRow>();
    return row ? mapRow(row) : null;
  }

  async findBySlug(
    projectId: string,
    slug: string,
  ): Promise<ImagePreset | null> {
    const row = await this.db
      .prepare("SELECT * FROM presets WHERE project_id = ? AND slug = ?")
      .bind(projectId, slug)
      .first<PresetRow>();
    return row ? mapRow(row) : null;
  }

  async countByProjectIds(
    projectIds: readonly string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (projectIds.length === 0) return map;
    const placeholders = projectIds.map(() => "?").join(", ");
    const result = await this.db
      .prepare(
        `SELECT project_id, COUNT(*) as count FROM presets WHERE project_id IN (${placeholders}) GROUP BY project_id`,
      )
      .bind(...projectIds)
      .all<{ project_id: string; count: number }>();
    for (const row of result.results) map.set(row.project_id, row.count);
    return map;
  }

  /** Unexecuted counterpart to `create()`, for combining with another repository's statement in a `db.batch()` call. */
  buildInsertStatement(id: string, input: CreatePresetRow, timestamp: string) {
    return this.db
      .prepare(
        "INSERT INTO presets (id, project_id, name, slug, description, operations, output_format, quality, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        input.projectId,
        input.name,
        input.slug,
        input.description ?? null,
        JSON.stringify(input.operations),
        input.outputFormat,
        input.quality ?? null,
        input.isSystem ? 1 : 0,
        timestamp,
        timestamp,
      );
  }

  async create(input: CreatePresetRow): Promise<ImagePreset> {
    const id = generateId();
    const timestamp = nowIso();
    await this.buildInsertStatement(id, input, timestamp).run();

    return {
      id,
      projectId: input.projectId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      operations: input.operations,
      outputFormat: input.outputFormat,
      quality: input.quality ?? null,
      isSystem: input.isSystem ?? false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async update(
    id: string,
    input: Partial<
      Pick<CreatePresetRow, "name" | "description" | "operations" | "outputFormat" | "quality">
    >,
  ): Promise<ImagePreset | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const timestamp = nowIso();
    const merged = {
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      operations: input.operations ?? existing.operations,
      outputFormat: input.outputFormat ?? existing.outputFormat,
      quality: input.quality !== undefined ? input.quality : existing.quality,
    };

    await this.db
      .prepare(
        "UPDATE presets SET name = ?, description = ?, operations = ?, output_format = ?, quality = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        merged.name,
        merged.description,
        JSON.stringify(merged.operations),
        merged.outputFormat,
        merged.quality,
        timestamp,
        id,
      )
      .run();

    return { ...existing, ...merged, updatedAt: timestamp };
  }

  /** System presets may be read but never deleted — this is the one place that rule is enforced. */
  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) return;
    if (existing.isSystem) {
      throw new SystemPresetDeletionError(
        `preset "${id}" is a system preset and cannot be deleted`,
      );
    }
    await this.db.prepare("DELETE FROM presets WHERE id = ?").bind(id).run();
  }
}
