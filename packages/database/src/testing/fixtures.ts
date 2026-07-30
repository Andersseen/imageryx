import type { Project } from "@imageryx/contracts";
import type { D1Client } from "../client";
import {
  AssetRepository,
  type CreateAssetRow,
} from "../repositories/asset.repository";
import {
  FolderRepository,
  type CreateFolderRow,
} from "../repositories/folder.repository";
import { ProjectRepository } from "../repositories/project.repository";

let counter = 0;
/** Deterministic-within-a-process unique suffix so parallel tests in the same run never collide on a UNIQUE column. */
function unique(label: string): string {
  counter += 1;
  return `${label}-${counter}`;
}

export async function insertTestProject(
  db: D1Client,
  overrides: Partial<{ name: string; slug: string }> = {},
): Promise<Project> {
  const repository = new ProjectRepository(db);
  const suffix = unique("project");
  return repository.create({
    name: overrides.name ?? `Test Project ${suffix}`,
    slug: overrides.slug ?? suffix,
  });
}

export async function insertTestFolder(
  db: D1Client,
  projectId: string,
  overrides: Partial<CreateFolderRow> = {},
) {
  const repository = new FolderRepository(db);
  const suffix = unique("folder");
  return repository.create({
    projectId,
    parentId: null,
    name: overrides.name ?? `Folder ${suffix}`,
    slug: overrides.slug ?? suffix,
    path: overrides.path ?? suffix,
  });
}

export async function insertTestAsset(
  db: D1Client,
  projectId: string,
  overrides: Partial<CreateAssetRow> = {},
) {
  const repository = new AssetRepository(db);
  const suffix = unique("asset");
  return repository.create({
    projectId,
    folderId: overrides.folderId ?? null,
    name: overrides.name ?? `Asset ${suffix}`,
    slug: overrides.slug ?? suffix,
    path: overrides.path ?? suffix,
    storageKey:
      overrides.storageKey ?? `originals/${projectId}/${suffix}/original.png`,
    originalFilename: overrides.originalFilename ?? `${suffix}.png`,
    mimeType: overrides.mimeType ?? "image/png",
    extension: overrides.extension ?? "png",
    width: overrides.width ?? 800,
    height: overrides.height ?? 600,
    aspectRatio: overrides.aspectRatio ?? 1.3333,
    sizeBytes: overrides.sizeBytes ?? 12345,
    checksum: overrides.checksum ?? "a".repeat(64),
    hasAlpha: overrides.hasAlpha ?? false,
    dominantColor: overrides.dominantColor ?? "#ffffff",
    placeholder: overrides.placeholder ?? null,
    visibility: overrides.visibility ?? "private",
    processingStatus: overrides.processingStatus ?? "ready",
    downloadOriginalEnabled: overrides.downloadOriginalEnabled ?? false,
  });
}
