import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { R2Bucket } from "@cloudflare/workers-types";
import {
  buildOriginalStorageKey,
  computeSha256Checksum,
} from "@imageryx/image-core";
import { R2StorageProvider } from "@imageryx/providers";
import { Miniflare } from "miniflare";
import type { D1Client } from "../src/client";
import {
  readApiWorkerD1Config,
  readApiWorkerR2Config,
} from "../src/config/wrangler-config";
import { AssetRepository } from "../src/repositories/asset.repository";
import { FolderRepository } from "../src/repositories/folder.repository";
import { PresetRepository } from "../src/repositories/preset.repository";
import { ProjectRepository } from "../src/repositories/project.repository";
import { TagRepository } from "../src/repositories/tag.repository";
import { AssetPersistenceService } from "../src/services/asset-persistence.service";
import {
  SEED_PRESETS,
  SEED_PROJECTS,
  SEED_TAGS,
  generateFixtureSvg,
} from "./seed-data";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const apiWorkerDir = join(repoRoot, "apps/api-worker");
const wranglerJsoncPath = join(apiWorkerDir, "wrangler.jsonc");

async function assertSchemaReady(db: D1Client): Promise<void> {
  const row = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
    )
    .first();
  if (!row) {
    throw new Error(
      "local D1 schema not found — run `pnpm db:migrate:local` before seeding",
    );
  }
}

async function main(): Promise<void> {
  const { binding: d1Binding, databaseId } = readApiWorkerD1Config(wranglerJsoncPath);
  const { binding: r2Binding, bucketName } = readApiWorkerR2Config(wranglerJsoncPath);
  // A repo-root-level shared directory, not `apps/api-worker/.wrangler/state`: every Worker's
  // `wrangler dev` (api-worker, delivery-worker, processing-worker) is a *separate* local process
  // launched from its own app directory, and would otherwise default to its own isolated
  // `.wrangler/state`. Passing the same `--persist-to` to all three (and to this script) is what
  // makes them see the same local D1 rows and R2 objects — see context.md's "Local Queue
  // development" / "Local-mode architecture" notes.
  const persistRoot = join(repoRoot, ".wrangler-state", "v3");

  const mf = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    d1Databases: { [d1Binding]: databaseId },
    d1Persist: true,
    r2Buckets: { [r2Binding]: bucketName },
    r2Persist: true,
    defaultPersistRoot: persistRoot,
  });

  try {
    const db = (await mf.getD1Database(d1Binding)) as unknown as D1Client;
    await assertSchemaReady(db);
    const bucket = (await mf.getR2Bucket(r2Binding)) as unknown as R2Bucket;
    const storage = new R2StorageProvider(bucket);
    const projectRepo = new ProjectRepository(db);
    const folderRepo = new FolderRepository(db);
    const tagRepo = new TagRepository(db);
    const presetRepo = new PresetRepository(db);
    const assetRepo = new AssetRepository(db);
    const assetService = new AssetPersistenceService(db);

    const summary = {
      projectsCreated: 0,
      foldersCreated: 0,
      tagsCreated: 0,
      presetsCreated: 0,
      assetsCreated: 0,
    };

    for (const projectSeed of SEED_PROJECTS) {
      let project = await projectRepo.findBySlug(projectSeed.slug);
      if (!project) {
        project = await projectRepo.create({
          name: projectSeed.name,
          slug: projectSeed.slug,
        });
        summary.projectsCreated += 1;
      }

      const folderIdBySlug = new Map<string, string>();
      for (const folderSeed of projectSeed.folders) {
        let folder = await folderRepo.findByPath(project.id, folderSeed.path);
        if (!folder) {
          const parentId = folderSeed.parentSlug
            ? (folderIdBySlug.get(folderSeed.parentSlug) ?? null)
            : null;
          folder = await folderRepo.create({
            projectId: project.id,
            parentId,
            name: folderSeed.name,
            slug: folderSeed.slug,
            path: folderSeed.path,
          });
          summary.foldersCreated += 1;
        }
        folderIdBySlug.set(folderSeed.slug, folder.id);
      }

      for (const tagName of SEED_TAGS) {
        const existing = await tagRepo.findByName(project.id, tagName);
        if (!existing) {
          await tagRepo.findOrCreate(project.id, tagName);
          summary.tagsCreated += 1;
        }
      }

      for (const presetSeed of SEED_PRESETS) {
        const existing = await presetRepo.findBySlug(
          project.id,
          presetSeed.slug,
        );
        if (!existing) {
          await presetRepo.create({
            projectId: project.id,
            name: presetSeed.name,
            slug: presetSeed.slug,
            operations: [...presetSeed.operations],
            outputFormat: presetSeed.outputFormat,
            quality: presetSeed.quality,
            isSystem: true,
          });
          summary.presetsCreated += 1;
        }
      }

      for (const fixture of projectSeed.fixtureAssets) {
        const existingAsset = await assetRepo.findByPublicPath(
          project.id,
          fixture.path,
        );
        if (existingAsset) continue;

        const svg = generateFixtureSvg(fixture.label);
        const bytes = new TextEncoder().encode(svg);
        const checksum = await computeSha256Checksum(bytes);
        // project/fixture slugs are our own generated identifiers (letters, digits, hyphens
        // only), so they satisfy buildOriginalStorageKey's opaque-segment requirement.
        const storageKey = buildOriginalStorageKey(
          projectSeed.slug,
          fixture.slug,
          "svg",
        );

        await storage.put({
          key: storageKey,
          body: bytes,
          contentType: "image/svg+xml",
        });

        await assetService.createAssetWithActivity({
          projectId: project.id,
          folderId: folderIdBySlug.get(fixture.folderSlug) ?? null,
          name: `${fixture.label} (fixture)`,
          slug: fixture.slug,
          path: fixture.path,
          storageKey,
          originalFilename: fixture.originalFilename,
          mimeType: "image/svg+xml",
          extension: "svg",
          sizeBytes: bytes.byteLength,
          checksum,
          visibility: "public",
          processingStatus: "ready",
        });
        summary.assetsCreated += 1;
      }
    }

    console.log("Imageryx local seed complete:");
    console.log(
      `  projects created:  ${summary.projectsCreated} (of ${SEED_PROJECTS.length} defined)`,
    );
    console.log(`  folders created:   ${summary.foldersCreated}`);
    console.log(`  tags created:      ${summary.tagsCreated}`);
    console.log(`  presets created:   ${summary.presetsCreated}`);
    console.log(`  assets created:    ${summary.assetsCreated}`);
    console.log(
      "  (re-running this script is safe — existing rows are left untouched)",
    );
  } finally {
    await mf.dispose();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
