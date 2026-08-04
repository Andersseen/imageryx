#!/usr/bin/env tsx
/**
 * Drains every currently-`queued` processing job against the same shared
 * local D1 + R2 state `wrangler dev` and the seed script use. Useful when
 * `PROCESSING_MODE=queue` local Queue delivery isn't running (or hasn't
 * caught up yet) and you want to process jobs without waiting — this
 * calls the exact same `processJob` function the real Queue consumer and
 * `PROCESSING_MODE=inline-local` use (see context.md), never a
 * reimplementation of the processing logic.
 */
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { D1Client } from "@imageryx/database";
import {
  readApiWorkerD1Config,
  readApiWorkerR2Config,
} from "@imageryx/database/testing";
import { processJob } from "@imageryx/processing-worker/jobs";
import { R2StorageProvider } from "@imageryx/providers";
import { Miniflare } from "miniflare";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const wranglerJsoncPath = join(repoRoot, "apps/api-worker/wrangler.jsonc");

async function main(): Promise<void> {
  const { binding: d1Binding, databaseId } = readApiWorkerD1Config(wranglerJsoncPath);
  const { binding: r2Binding, bucketName } = readApiWorkerR2Config(wranglerJsoncPath);
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
    const bucket = (await mf.getR2Bucket(r2Binding)) as unknown as R2Bucket;
    const storage = new R2StorageProvider(bucket);

    const queued = await db
      .prepare("SELECT id FROM processing_jobs WHERE status = 'queued' ORDER BY created_at ASC")
      .all<{ id: string }>();

    if (queued.results.length === 0) {
      console.log("No queued processing jobs found.");
      return;
    }

    console.log(`Draining ${queued.results.length} queued job(s)...`);
    let completed = 0;
    let failed = 0;
    for (const row of queued.results) {
      const outcome = await processJob(
        { db, storage, maxAttempts: 3, cloudinary: null },
        row.id,
      );
      if (outcome.outcome === "completed") completed += 1;
      else if (outcome.outcome === "failed") failed += 1;
      console.log(`  ${row.id}: ${JSON.stringify(outcome)}`);
    }
    console.log(`Done. completed=${completed} failed=${failed}`);
  } finally {
    await mf.dispose();
  }
}

main().catch((error: unknown) => {
  console.error("processing:run-local failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
