import type { ImageAsset } from "@imageryx/contracts";
import type { D1Client } from "../client";
import { generateId, nowIso } from "../ids";
import { AssetActivityRepository } from "../repositories/asset-activity.repository";
import {
  AssetRepository,
  type CreateAssetRow,
} from "../repositories/asset.repository";

/**
 * True `db.batch()` atomicity: both the asset row and its first activity
 * row are prepared (not executed) up front, since both IDs and the
 * timestamp are known before any write happens, then submitted together.
 * If D1 rejects the batch, neither row is written.
 */
export class AssetPersistenceService {
  private readonly assets: AssetRepository;
  private readonly activity: AssetActivityRepository;

  constructor(private readonly db: D1Client) {
    this.assets = new AssetRepository(db);
    this.activity = new AssetActivityRepository(db);
  }

  /**
   * `options.id`, when provided, lets a caller pre-generate the asset ID
   * before this call (e.g. to build its physical storage key and write
   * the object *before* the metadata row exists) so the stored bytes and
   * the persisted row always agree on the same ID.
   */
  async createAssetWithActivity(
    input: CreateAssetRow,
    options: {
      id?: string;
      event?: string;
      metadata?: Record<string, unknown> | null;
    } = {},
  ): Promise<ImageAsset> {
    const assetId = options.id ?? generateId();
    const activityId = generateId();
    const timestamp = nowIso();

    await this.db.batch([
      this.assets.buildInsertStatement(assetId, input, timestamp),
      this.activity.buildInsertStatement(
        activityId,
        {
          assetId,
          projectId: input.projectId,
          event: options.event ?? "asset.created",
          metadata: options.metadata ?? { storageKey: input.storageKey },
        },
        timestamp,
      ),
    ]);

    const created = await this.assets.findById(assetId);
    if (!created) throw new Error("failed to read back newly created asset");
    return created;
  }

  /**
   * Soft delete + activity as a single batch. Restoring an asset is a
   * much lower-stakes, less frequently audited operation than deleting
   * one, so `AssetRepository.restore()` is used directly by callers
   * instead of gaining its own service — batching it would just duplicate
   * this same pattern for marginal benefit.
   */
  async softDeleteAssetWithActivity(
    assetId: string,
    projectId: string,
  ): Promise<void> {
    const activityId = generateId();
    const timestamp = nowIso();

    await this.db.batch([
      this.db
        .prepare(
          "UPDATE assets SET deleted_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(timestamp, timestamp, assetId),
      this.activity.buildInsertStatement(
        activityId,
        { assetId, projectId, event: "asset.soft_deleted" },
        timestamp,
      ),
    ]);
  }
}
