import { type Folder } from "@imageryx/contracts";
import { FolderPathConflictError } from "@imageryx/image-core";
import type { DatabaseClient, DatabaseStatement } from "../client";
import { nowIso } from "../ids";
import { AssetRepository } from "../repositories/asset.repository";
import { FolderRepository } from "../repositories/folder.repository";

/**
 * Moving or renaming a folder's *parent* changes that folder's (and every
 * descendant folder's) `path` — `FolderRepository.move()` already cascades
 * that correctly. But `assets.path` is its own denormalized column (not
 * derived from `folder_id` at read time — see context.md's "Logical path
 * vs. physical storage key"), so without this service every descendant
 * asset's stored `path` goes stale the moment its containing folder moves,
 * even though its `folder_id` still points at the right place. Delivery
 * resolves purely off `assets.path`, so this was a real data-integrity gap,
 * not a cosmetic one. Physical `storage_key` is never touched here — only
 * the logical `path` column, exactly like a project slug rename never
 * moves a single byte in storage.
 */
export class FolderPersistenceService {
  private readonly folders: FolderRepository;
  private readonly assets: AssetRepository;

  constructor(private readonly db: DatabaseClient) {
    this.folders = new FolderRepository(db);
    this.assets = new AssetRepository(db);
  }

  async moveFolderWithDescendants(
    id: string,
    newParentId: string | null,
  ): Promise<Folder | null> {
    const built = await this.folders.buildMoveStatements(id, newParentId);
    if (!built) return null;
    if (built.statements.length === 0) return built.moved;

    const { existing, moved, statements: folderStatements } = built;

    const subtreeFolders = await this.folders.listSubtree(
      existing.projectId,
      existing.path,
    );
    const subtreeFolderIds = subtreeFolders.map((folder) => folder.id);
    const affectedAssets =
      await this.assets.listActiveByFolderIds(subtreeFolderIds);

    const timestamp = nowIso();
    const rewrittenPathByAssetId = new Map<string, string>();
    for (const asset of affectedAssets) {
      rewrittenPathByAssetId.set(
        asset.id,
        moved.path + asset.path.slice(existing.path.length),
      );
    }

    if (rewrittenPathByAssetId.size > 0) {
      const candidatePaths = [...new Set(rewrittenPathByAssetId.values())];
      const collisions = await this.assets.findActiveByPaths(
        existing.projectId,
        candidatePaths,
      );
      const movingAssetIds = new Set(rewrittenPathByAssetId.keys());
      const externalCollision = collisions.find(
        (asset) => !movingAssetIds.has(asset.id),
      );
      if (externalCollision) {
        throw new FolderPathConflictError(
          `Cannot move: an asset already exists at path "${externalCollision.path}".`,
        );
      }
    }

    const assetStatements: DatabaseStatement[] = [
      ...rewrittenPathByAssetId.entries(),
    ].map(([assetId, path]) =>
      this.assets.buildUpdatePathStatement(assetId, path, timestamp),
    );

    await this.db.batch([...folderStatements, ...assetStatements]);
    return moved;
  }
}
