import type { R2Bucket } from "@cloudflare/workers-types";
import { createTestDatabase } from "@imageryx/database/testing";
import { Miniflare } from "miniflare";

export interface IntegrationEnvironment {
  db: Awaited<ReturnType<typeof createTestDatabase>>["db"];
  bucket: R2Bucket;
  teardown: () => Promise<void>;
}

/**
 * Real D1 (via the same ephemeral Miniflare-backed harness the database
 * package's own tests use) + real R2 (a second, independent ephemeral
 * Miniflare instance — no shared `--persist-to` needed here, unlike local
 * dev, since everything runs inside one test process). Never mocked.
 */
export async function createIntegrationEnvironment(): Promise<IntegrationEnvironment> {
  const { db, teardown: teardownDb } = await createTestDatabase();

  const r2Miniflare = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    r2Buckets: { BUCKET: "imageryx-integration-test" },
  });
  const bucket = (await r2Miniflare.getR2Bucket("BUCKET")) as unknown as R2Bucket;

  return {
    db,
    bucket,
    teardown: async () => {
      await teardownDb();
      await r2Miniflare.dispose();
    },
  };
}
