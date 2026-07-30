import type { ImagePreset } from "@imageryx/contracts";
import type { D1Client } from "../client";
import { SYSTEM_PRESET_DEFINITIONS } from "../presets/system-presets";
import {
  PresetRepository,
  type CreatePresetRow,
} from "../repositories/preset.repository";

/**
 * `asset_activity` is asset-scoped (NOT NULL `asset_id` FK) — a
 * project-level event like "preset created" has no asset to attach it to,
 * so there is no second table to batch here today. This service exists as
 * the documented seam for a future project-level activity log, and so
 * preset creation has the same "one persistence entry point" shape as
 * `AssetPersistenceService` and `VariantPersistenceService`.
 */
export class PresetPersistenceService {
  private readonly presets: PresetRepository;

  constructor(db: D1Client) {
    this.presets = new PresetRepository(db);
  }

  async createPreset(input: CreatePresetRow): Promise<ImagePreset> {
    return this.presets.create(input);
  }

  /** Idempotent: skips any system preset slug that already exists for the project (mirrors the seed script's own re-run safety). */
  async createSystemPresetsForProject(projectId: string): Promise<ImagePreset[]> {
    const created: ImagePreset[] = [];
    for (const definition of SYSTEM_PRESET_DEFINITIONS) {
      const existing = await this.presets.findBySlug(projectId, definition.slug);
      if (existing) continue;
      created.push(
        await this.presets.create({
          projectId,
          name: definition.name,
          slug: definition.slug,
          operations: [...definition.operations],
          outputFormat: definition.outputFormat,
          quality: definition.quality,
          isSystem: true,
        }),
      );
    }
    return created;
  }
}
