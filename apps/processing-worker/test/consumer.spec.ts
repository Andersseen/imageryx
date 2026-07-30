import { AssetRepository, ProcessingJobRepository, ProjectRepository } from "@imageryx/database";
import { buildOriginalStorageKey } from "@imageryx/image-core";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleQueueBatch } from "../src/queue/consumer";

function fakeMessage(body: unknown) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    attempts: 1,
  } as unknown as Message<unknown>;
}

function fakeBatch(messages: Message<unknown>[]): MessageBatch<unknown> {
  return { messages, queue: "imageryx-processing-queue" } as unknown as MessageBatch<unknown>;
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32, 0x08, 0x06,
]);

describe("handleQueueBatch", () => {
  let projectId: string;

  beforeEach(async () => {
    const projects = new ProjectRepository(env.DB);
    projectId = (
      await projects.create({ name: "Consumer Test", slug: `consumer-${crypto.randomUUID()}` })
    ).id;
  });

  it("acknowledges a well-formed message referencing a completable job", async () => {
    const assetId = crypto.randomUUID();
    const storageKey = buildOriginalStorageKey(projectId, assetId, "png");
    await env.ASSET_STORAGE.put(storageKey, PNG_BYTES);

    const assets = new AssetRepository(env.DB);
    const asset = await assets.create(
      {
        projectId,
        name: "Asset",
        slug: "asset",
        path: "asset",
        storageKey,
        originalFilename: "asset.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: PNG_BYTES.byteLength,
        checksum: "a".repeat(64),
        visibility: "public",
        processingStatus: "pending",
      },
      assetId,
    );

    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: asset.id },
    });

    const message = fakeMessage({ jobId: job.id });
    await handleQueueBatch(fakeBatch([message]), env, {} as ExecutionContext);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries a malformed message instead of dropping it", async () => {
    const message = fakeMessage({ notAJobId: true });
    await handleQueueBatch(fakeBatch([message]), env, {} as ExecutionContext);

    expect(message.retry).toHaveBeenCalledOnce();
    expect(message.ack).not.toHaveBeenCalled();
  });

  it("acknowledges a message referencing an unknown job ID", async () => {
    const message = fakeMessage({ jobId: crypto.randomUUID() });
    await handleQueueBatch(fakeBatch([message]), env, {} as ExecutionContext);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("acknowledges duplicate delivery of an already-completed job without reprocessing", async () => {
    const assetId = crypto.randomUUID();
    const storageKey = buildOriginalStorageKey(projectId, assetId, "png");
    await env.ASSET_STORAGE.put(storageKey, PNG_BYTES);

    const assets = new AssetRepository(env.DB);
    const asset = await assets.create(
      {
        projectId,
        name: "Asset",
        slug: "asset-2",
        path: "asset-2",
        storageKey,
        originalFilename: "asset.png",
        mimeType: "image/png",
        extension: "png",
        sizeBytes: PNG_BYTES.byteLength,
        checksum: "a".repeat(64),
        visibility: "public",
        processingStatus: "pending",
      },
      assetId,
    );

    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      assetId: asset.id,
      type: "inspect-metadata",
      input: { type: "inspect-metadata", assetId: asset.id },
    });

    const firstMessage = fakeMessage({ jobId: job.id });
    await handleQueueBatch(fakeBatch([firstMessage]), env, {} as ExecutionContext);
    expect(firstMessage.ack).toHaveBeenCalledOnce();

    const secondMessage = fakeMessage({ jobId: job.id });
    await handleQueueBatch(fakeBatch([secondMessage]), env, {} as ExecutionContext);
    expect(secondMessage.ack).toHaveBeenCalledOnce();

    const finalJob = await jobs.findById(job.id);
    expect(finalJob?.attempts).toBe(1);
  });

  it("retries a job that fails with a retryable (unclassified) error", async () => {
    // A generate-variant job whose referenced asset does not exist raises MissingResourceError
    // (non-retryable) — used here only to exercise the "not retryable -> ack" path distinctly
    // from the retryable path already covered by process-job.spec.ts's classification tests.
    const jobs = new ProcessingJobRepository(env.DB);
    const job = await jobs.create({
      projectId,
      assetId: null,
      type: "generate-variant",
      input: {
        type: "generate-variant",
        assetId: crypto.randomUUID(),
        presetId: crypto.randomUUID(),
        presetHash: "hash-x",
        persist: true,
      },
    });

    const message = fakeMessage({ jobId: job.id });
    await handleQueueBatch(fakeBatch([message]), env, {} as ExecutionContext);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();

    const failedJob = await jobs.findById(job.id);
    expect(failedJob?.status).toBe("failed");
  });
});
