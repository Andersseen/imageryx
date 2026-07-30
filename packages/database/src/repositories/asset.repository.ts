import {
  type AssetFilter,
  type ImageAsset,
  assetSchema,
} from "@imageryx/contracts";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";

interface AssetRow {
  id: string;
  project_id: string;
  folder_id: string | null;
  name: string;
  slug: string;
  path: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  extension: string;
  width: number | null;
  height: number | null;
  aspect_ratio: number | null;
  size_bytes: number;
  checksum: string;
  has_alpha: number | null;
  dominant_color: string | null;
  placeholder: string | null;
  visibility: string;
  processing_status: string;
  download_original_enabled: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapRow(row: AssetRow): ImageAsset {
  return assetSchema.parse({
    id: row.id,
    projectId: row.project_id,
    folderId: row.folder_id,
    name: row.name,
    slug: row.slug,
    path: row.path,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    extension: row.extension,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspect_ratio,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    hasAlpha: row.has_alpha === null ? null : row.has_alpha === 1,
    dominantColor: row.dominant_color,
    placeholder: row.placeholder,
    visibility: row.visibility,
    processingStatus: row.processing_status,
    downloadOriginalEnabled: row.download_original_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export interface CreateAssetRow {
  projectId: string;
  folderId?: string | null;
  name: string;
  slug: string;
  path: string;
  storageKey: string;
  originalFilename: string;
  mimeType: ImageAsset["mimeType"];
  extension: ImageAsset["extension"];
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  sizeBytes: number;
  checksum: string;
  hasAlpha?: boolean | null;
  dominantColor?: string | null;
  placeholder?: string | null;
  visibility: ImageAsset["visibility"];
  processingStatus: ImageAsset["processingStatus"];
  downloadOriginalEnabled?: boolean;
}

export interface UpdateAssetRow {
  name?: string;
  folderId?: string | null;
  visibility?: ImageAsset["visibility"];
  processingStatus?: ImageAsset["processingStatus"];
  downloadOriginalEnabled?: boolean;
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  hasAlpha?: boolean | null;
  dominantColor?: string | null;
  placeholder?: string | null;
}

const SORT_COLUMNS: Record<AssetFilter["sortField"], string> = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  name: "name",
  sizeBytes: "size_bytes",
};

interface WhereClause {
  sql: string;
  params: unknown[];
}

/** Shared by `list` and `count` so the two never drift out of sync with each other. Every value is bound — never interpolated. */
function buildWhereClause(filters: AssetFilter): WhereClause {
  const conditions: string[] = ["assets.project_id = ?"];
  const params: unknown[] = [filters.projectId];

  if (filters.folderId !== undefined) {
    if (filters.folderId === null) {
      conditions.push("assets.folder_id IS NULL");
    } else {
      conditions.push("assets.folder_id = ?");
      params.push(filters.folderId);
    }
  }

  if (filters.mimeType) {
    conditions.push("assets.mime_type = ?");
    params.push(filters.mimeType);
  }

  if (filters.extension) {
    conditions.push("assets.extension = ?");
    params.push(filters.extension);
  }

  if (filters.visibility) {
    conditions.push("assets.visibility = ?");
    params.push(filters.visibility);
  }

  if (filters.processingStatus) {
    conditions.push("assets.processing_status = ?");
    params.push(filters.processingStatus);
  }

  if (filters.search) {
    conditions.push(
      "(assets.name LIKE ? ESCAPE '\\' OR assets.original_filename LIKE ? ESCAPE '\\')",
    );
    const escaped = escapeLikePattern(filters.search);
    params.push(`%${escaped}%`, `%${escaped}%`);
  }

  if (filters.minWidth !== undefined) {
    conditions.push("assets.width >= ?");
    params.push(filters.minWidth);
  }
  if (filters.maxWidth !== undefined) {
    conditions.push("assets.width <= ?");
    params.push(filters.maxWidth);
  }
  if (filters.minHeight !== undefined) {
    conditions.push("assets.height >= ?");
    params.push(filters.minHeight);
  }
  if (filters.maxHeight !== undefined) {
    conditions.push("assets.height <= ?");
    params.push(filters.maxHeight);
  }

  if (filters.createdAfter) {
    conditions.push("assets.created_at >= ?");
    params.push(filters.createdAfter);
  }
  if (filters.createdBefore) {
    conditions.push("assets.created_at <= ?");
    params.push(filters.createdBefore);
  }

  if (filters.deleted === "active") {
    conditions.push("assets.deleted_at IS NULL");
  } else if (filters.deleted === "deleted") {
    conditions.push("assets.deleted_at IS NOT NULL");
  }

  if (filters.tag) {
    conditions.push(
      "assets.id IN (SELECT asset_tags.asset_id FROM asset_tags INNER JOIN tags ON tags.id = asset_tags.tag_id WHERE tags.project_id = ? AND tags.name = ?)",
    );
    params.push(filters.projectId, filters.tag);
  }

  return { sql: conditions.join(" AND "), params };
}

/** Escapes `%`, `_`, and the escape character itself so a user's search text can't inject LIKE wildcards. */
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export class AssetRepository {
  constructor(private readonly db: D1Client) {}

  async list(filters: AssetFilter): Promise<ImageAsset[]> {
    const where = buildWhereClause(filters);
    const sortColumn = SORT_COLUMNS[filters.sortField];
    const direction = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const offset = (filters.page - 1) * filters.pageSize;

    const result = await this.db
      .prepare(
        `SELECT assets.* FROM assets WHERE ${where.sql} ORDER BY assets.${sortColumn} ${direction} LIMIT ? OFFSET ?`,
      )
      .bind(...where.params, filters.pageSize, offset)
      .all<AssetRow>();

    return result.results.map(mapRow);
  }

  async count(filters: AssetFilter): Promise<number> {
    const where = buildWhereClause(filters);
    const row = await this.db
      .prepare(`SELECT COUNT(*) as total FROM assets WHERE ${where.sql}`)
      .bind(...where.params)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  async findById(id: string): Promise<ImageAsset | null> {
    const row = await this.db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .bind(id)
      .first<AssetRow>();
    return row ? mapRow(row) : null;
  }

  async findByPublicPath(
    projectId: string,
    path: string,
  ): Promise<ImageAsset | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM assets WHERE project_id = ? AND path = ? AND deleted_at IS NULL",
      )
      .bind(projectId, path)
      .first<AssetRow>();
    return row ? mapRow(row) : null;
  }

  async findByChecksum(
    projectId: string,
    checksum: string,
  ): Promise<ImageAsset | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM assets WHERE project_id = ? AND checksum = ? AND deleted_at IS NULL",
      )
      .bind(projectId, checksum)
      .first<AssetRow>();
    return row ? mapRow(row) : null;
  }

  /**
   * Builds the INSERT statement without executing it, so a caller that
   * needs true `db.batch()` atomicity across tables (see
   * `AssetPersistenceService`) can combine it with another repository's
   * unexecuted statement in one batch. `create()` below is the normal
   * single-table convenience wrapper around this.
   */
  buildInsertStatement(id: string, input: CreateAssetRow, timestamp: string) {
    return this.db
      .prepare(
        `INSERT INTO assets (
          id, project_id, folder_id, name, slug, path, storage_key, original_filename, mime_type, extension,
          width, height, aspect_ratio, size_bytes, checksum, has_alpha, dominant_color, placeholder,
          visibility, processing_status, download_original_enabled, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.projectId,
        input.folderId ?? null,
        input.name,
        input.slug,
        input.path,
        input.storageKey,
        input.originalFilename,
        input.mimeType,
        input.extension,
        input.width ?? null,
        input.height ?? null,
        input.aspectRatio ?? null,
        input.sizeBytes,
        input.checksum,
        input.hasAlpha === undefined || input.hasAlpha === null
          ? null
          : input.hasAlpha
            ? 1
            : 0,
        input.dominantColor ?? null,
        input.placeholder ?? null,
        input.visibility,
        input.processingStatus,
        input.downloadOriginalEnabled ? 1 : 0,
        timestamp,
        timestamp,
        null,
      );
  }

  async create(input: CreateAssetRow): Promise<ImageAsset> {
    const id = generateId();
    const timestamp = nowIso();
    await this.buildInsertStatement(id, input, timestamp).run();

    const created = await this.findById(id);
    if (!created) throw new Error("failed to read back newly created asset");
    return created;
  }

  async update(id: string, input: UpdateAssetRow): Promise<ImageAsset | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const timestamp = nowIso();
    const merged = {
      name: input.name ?? existing.name,
      folderId:
        input.folderId !== undefined ? input.folderId : existing.folderId,
      visibility: input.visibility ?? existing.visibility,
      processingStatus: input.processingStatus ?? existing.processingStatus,
      downloadOriginalEnabled:
        input.downloadOriginalEnabled ?? existing.downloadOriginalEnabled,
      width: input.width !== undefined ? input.width : existing.width,
      height: input.height !== undefined ? input.height : existing.height,
      aspectRatio:
        input.aspectRatio !== undefined
          ? input.aspectRatio
          : existing.aspectRatio,
      hasAlpha:
        input.hasAlpha !== undefined ? input.hasAlpha : existing.hasAlpha,
      dominantColor:
        input.dominantColor !== undefined
          ? input.dominantColor
          : existing.dominantColor,
      placeholder:
        input.placeholder !== undefined
          ? input.placeholder
          : existing.placeholder,
    };

    await this.db
      .prepare(
        `UPDATE assets SET name = ?, folder_id = ?, visibility = ?, processing_status = ?, download_original_enabled = ?,
          width = ?, height = ?, aspect_ratio = ?, has_alpha = ?, dominant_color = ?, placeholder = ?, updated_at = ?
        WHERE id = ?`,
      )
      .bind(
        merged.name,
        merged.folderId,
        merged.visibility,
        merged.processingStatus,
        merged.downloadOriginalEnabled ? 1 : 0,
        merged.width,
        merged.height,
        merged.aspectRatio,
        merged.hasAlpha === null ? null : merged.hasAlpha ? 1 : 0,
        merged.dominantColor,
        merged.placeholder,
        timestamp,
        id,
      )
      .run();

    return { ...existing, ...merged, updatedAt: timestamp };
  }

  async softDelete(id: string): Promise<void> {
    const timestamp = nowIso();
    await this.db
      .prepare("UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, id)
      .run();
  }

  async restore(id: string): Promise<void> {
    const timestamp = nowIso();
    await this.db
      .prepare(
        "UPDATE assets SET deleted_at = NULL, updated_at = ? WHERE id = ?",
      )
      .bind(timestamp, id)
      .run();
  }
}
