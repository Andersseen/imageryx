import { type ImageVariant, variantSchema } from "@imageryx/contracts";
import { DuplicateVariantError } from "@imageryx/image-core";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

interface VariantRow {
  id: string;
  asset_id: string;
  preset_id: string;
  preset_hash: string;
  provider: string;
  storage_key: string | null;
  delivery_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  checksum: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: VariantRow): ImageVariant {
  return variantSchema.parse({
    id: row.id,
    assetId: row.asset_id,
    presetId: row.preset_id,
    presetHash: row.preset_hash,
    provider: row.provider,
    storageKey: row.storage_key,
    deliveryUrl: row.delivery_url,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreateVariantRow {
  assetId: string;
  presetId: string;
  presetHash: string;
  provider: ImageVariant["provider"];
  status: ImageVariant["status"];
}

export interface UpdateVariantRow {
  status?: ImageVariant["status"];
  storageKey?: string | null;
  deliveryUrl?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  checksum?: string | null;
}

const UNIQUE_CONSTRAINT_ERROR_PATTERN = /UNIQUE constraint failed/i;

export class VariantRepository {
  constructor(private readonly db: D1Client) {}

  async listByAsset(assetId: string): Promise<ImageVariant[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM variants WHERE asset_id = ? ORDER BY created_at ASC",
      )
      .bind(assetId)
      .all<VariantRow>();
    return result.results.map(mapRow);
  }

  async findById(id: string): Promise<ImageVariant | null> {
    const row = await this.db
      .prepare("SELECT * FROM variants WHERE id = ?")
      .bind(id)
      .first<VariantRow>();
    return row ? mapRow(row) : null;
  }

  async findByAssetAndPresetHash(
    assetId: string,
    presetHash: string,
  ): Promise<ImageVariant | null> {
    const row = await this.db
      .prepare("SELECT * FROM variants WHERE asset_id = ? AND preset_hash = ?")
      .bind(assetId, presetHash)
      .first<VariantRow>();
    return row ? mapRow(row) : null;
  }

  /** Unexecuted counterpart to `create()`, for combining with another repository's statement in a `db.batch()` call (e.g. `VariantPersistenceService`). */
  buildInsertStatement(id: string, input: CreateVariantRow, timestamp: string) {
    return this.db
      .prepare(
        "INSERT INTO variants (id, asset_id, preset_id, preset_hash, provider, storage_key, delivery_url, mime_type, width, height, size_bytes, checksum, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)",
      )
      .bind(
        id,
        input.assetId,
        input.presetId,
        input.presetHash,
        input.provider,
        input.status,
        timestamp,
        timestamp,
      );
  }

  /** Relies on `idx_variants_unique_asset_preset_hash` to make a duplicate impossible, and translates the raw constraint failure into a typed domain error. */
  async create(input: CreateVariantRow): Promise<ImageVariant> {
    const id = generateId();
    const timestamp = nowIso();
    try {
      await this.buildInsertStatement(id, input, timestamp).run();
    } catch (error) {
      if (
        error instanceof Error &&
        UNIQUE_CONSTRAINT_ERROR_PATTERN.test(error.message)
      ) {
        throw new DuplicateVariantError(
          `a variant for asset "${input.assetId}" with preset hash "${input.presetHash}" already exists`,
        );
      }
      throw error;
    }

    return {
      id,
      assetId: input.assetId,
      presetId: input.presetId,
      presetHash: input.presetHash,
      provider: input.provider,
      storageKey: null,
      deliveryUrl: null,
      mimeType: null,
      width: null,
      height: null,
      sizeBytes: null,
      checksum: null,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async update(
    id: string,
    input: UpdateVariantRow,
  ): Promise<ImageVariant | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const timestamp = nowIso();
    const merged = {
      status: input.status ?? existing.status,
      storageKey:
        input.storageKey !== undefined ? input.storageKey : existing.storageKey,
      deliveryUrl:
        input.deliveryUrl !== undefined
          ? input.deliveryUrl
          : existing.deliveryUrl,
      mimeType:
        input.mimeType !== undefined ? input.mimeType : existing.mimeType,
      width: input.width !== undefined ? input.width : existing.width,
      height: input.height !== undefined ? input.height : existing.height,
      sizeBytes:
        input.sizeBytes !== undefined ? input.sizeBytes : existing.sizeBytes,
      checksum:
        input.checksum !== undefined ? input.checksum : existing.checksum,
    };

    await this.db
      .prepare(
        "UPDATE variants SET status = ?, storage_key = ?, delivery_url = ?, mime_type = ?, width = ?, height = ?, size_bytes = ?, checksum = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        merged.status,
        merged.storageKey,
        merged.deliveryUrl,
        merged.mimeType,
        merged.width,
        merged.height,
        merged.sizeBytes,
        merged.checksum,
        timestamp,
        id,
      )
      .run();

    return { ...existing, ...merged, updatedAt: timestamp };
  }
}
