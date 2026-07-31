import type {
  Folder,
  ImageAsset,
  ImagePreset,
  ImageVariant,
  PaginatedResponse,
  PreviewPresetResponse,
  ProcessingJob,
  Project,
} from "@imageryx/contracts";

/** Response DTOs that compose repository rows with derived summary data — hand-mirrored from `api-worker`'s route handlers (no shared OpenAPI/codegen in this phase, see context.md). */

export interface ProjectSummary extends Project {
  assetCount: number;
  folderCount: number;
  presetCount: number;
  totalOriginalBytes: number;
  latestActivity: { event: string; createdAt: string } | null;
}

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
}

export interface FolderListResponse {
  items: Folder[];
  tree?: FolderTreeNode[];
}

/** Mirrors `@imageryx/database`'s `Tag` interface — not re-exported from `@imageryx/contracts` (tags have no Zod schema there yet, see context.md). */
export interface ProjectTag {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export interface AssetListItem extends ImageAsset {
  tags: string[];
  readyVariantCount: number;
  /** Preset slugs with a `ready` variant — the only preset delivery URLs that resolve for this asset today. */
  readyPresetSlugs: string[];
  folder: { id: string; name: string; path: string } | null;
}

export interface AssetActivityEntry {
  id: string;
  assetId: string;
  projectId: string;
  event: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AssetDetails extends ImageAsset {
  tags: string[];
  project: { id: string; name: string; slug: string } | null;
  folder: { id: string; name: string; path: string } | null;
  presets: { id: string; name: string; slug: string }[];
  variants: ImageVariant[];
  processingJobs: ProcessingJob[];
  activity: AssetActivityEntry[];
  delivery: { originalUrl: string; originalPath: string } | null;
  duplicateCandidates: { assetId: string; path: string }[];
}

export interface AssetDeliveryInfo {
  visibility: "public" | "private";
  originalUrl: string;
  presets: {
    id: string;
    slug: string;
    name: string;
    ready: boolean;
    url: string;
  }[];
}

export interface UploadAssetResponse {
  asset: ImageAsset;
  processingJobId: string;
  processingDispatch: { mode: "queue" | "inline-local"; dispatched: boolean };
  duplicateCandidates: { assetId: string; path: string }[];
  securityWarnings: string[];
}

export interface RequestVariantResponse {
  variant: ImageVariant;
  processingJobId: string | null;
  status: "created" | "ready" | "pending" | "failed";
}

export interface UploadAssetOptions {
  projectId: string;
  folderId?: string | null;
  file: Blob | File;
  fileName?: string;
  name?: string;
  tags?: string[];
  visibility?: "public" | "private";
  downloadOriginalEnabled?: boolean;
}

export type {
  PaginatedResponse,
  ImagePreset,
  ImageVariant,
  PreviewPresetResponse,
  ProcessingJob,
  Project,
  Folder,
  ImageAsset,
};
