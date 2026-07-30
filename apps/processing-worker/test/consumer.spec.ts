import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
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

describe("handleQueueBatch", () => {
  it("acknowledges a well-formed placeholder job", async () => {
    const message = fakeMessage({
      kind: "placeholder",
      jobId: "job_1",
      enqueuedAt: new Date().toISOString(),
    });
    const batch = {
      messages: [message],
      queue: "imageryx-processing-queue",
    } as unknown as MessageBatch<unknown>;

    await handleQueueBatch(batch, env, {} as ExecutionContext);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries an unrecognized job shape instead of dropping it", async () => {
    const message = fakeMessage({ kind: "unknown-future-job" });
    const batch = {
      messages: [message],
      queue: "imageryx-processing-queue",
    } as unknown as MessageBatch<unknown>;

    await handleQueueBatch(batch, env, {} as ExecutionContext);

    expect(message.retry).toHaveBeenCalledOnce();
    expect(message.ack).not.toHaveBeenCalled();
  });
});
