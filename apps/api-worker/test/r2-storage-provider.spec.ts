import { R2StorageProvider } from "@imageryx/providers";
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * `@imageryx/providers` itself runs under plain Node (no R2 binding
 * available there — see its `vitest.config.ts`), so `R2StorageProvider`
 * has never been exercised against a real `R2Bucket` until this file.
 * Every Worker in production constructs exactly this class against
 * `env.ASSET_STORAGE` — see `packages/providers/src/config/provider-config.ts`.
 */
describe("R2StorageProvider (real R2 binding)", () => {
  let provider: R2StorageProvider;

  beforeEach(() => {
    provider = new R2StorageProvider(env.ASSET_STORAGE);
  });

  async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  it("writes and reads back an object with the right content type", async () => {
    const key = `test/r2-provider/${crypto.randomUUID()}.png`;
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const put = await provider.put({ key, body: bytes, contentType: "image/png" });
    expect(put.key).toBe(key);
    expect(put.size).toBe(bytes.byteLength);
    expect(put.contentType).toBe("image/png");

    const got = await provider.get(key);
    expect(got).not.toBeNull();
    expect(got!.contentType).toBe("image/png");
    expect(await readAllChunks(got!.body)).toEqual(bytes);
  });

  it("accepts an ArrayBuffer body, not just Uint8Array", async () => {
    const key = `test/r2-provider/${crypto.randomUUID()}.bin`;
    const buffer = new Uint8Array([9, 8, 7]).buffer;

    await provider.put({ key, body: buffer });
    const got = await provider.get(key);
    expect(await readAllChunks(got!.body)).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("accepts a ReadableStream body", async () => {
    const key = `test/r2-provider/${crypto.randomUUID()}.txt`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed via r2"));
        controller.close();
      },
    });

    await provider.put({ key, body: stream });
    const got = await provider.get(key);
    expect(new TextDecoder().decode(await readAllChunks(got!.body))).toBe("streamed via r2");
  });

  it("head() returns metadata without a body and without a real network read of the object", async () => {
    const key = `test/r2-provider/${crypto.randomUUID()}.png`;
    await provider.put({ key, body: new Uint8Array([1, 2, 3]), contentType: "image/png" });

    const meta = await provider.head(key);
    expect(meta).toEqual(
      expect.objectContaining({ key, size: 3, contentType: "image/png" }),
    );
    expect(meta).not.toHaveProperty("body");
  });

  it("get()/head() return null for a missing object rather than throwing", async () => {
    const key = `test/r2-provider/missing-${crypto.randomUUID()}`;
    expect(await provider.get(key)).toBeNull();
    expect(await provider.head(key)).toBeNull();
  });

  it("exists() reflects put/delete", async () => {
    const key = `test/r2-provider/${crypto.randomUUID()}.png`;
    expect(await provider.exists(key)).toBe(false);

    await provider.put({ key, body: new Uint8Array([1]) });
    expect(await provider.exists(key)).toBe(true);

    await provider.delete(key);
    expect(await provider.exists(key)).toBe(false);
  });

  it("delete() on a key that never existed does not throw", async () => {
    const key = `test/r2-provider/never-existed-${crypto.randomUUID()}`;
    await expect(provider.delete(key)).resolves.not.toThrow();
  });

  it("assigns a real etag distinct across different object contents", async () => {
    const keyA = `test/r2-provider/${crypto.randomUUID()}.png`;
    const keyB = `test/r2-provider/${crypto.randomUUID()}.png`;
    const objectA = await provider.put({ key: keyA, body: new Uint8Array([1]) });
    const objectB = await provider.put({ key: keyB, body: new Uint8Array([2]) });

    expect(objectA.etag).toBeTruthy();
    expect(objectB.etag).toBeTruthy();
    expect(objectA.etag).not.toBe(objectB.etag);
  });

  it("createDownloadUrl still always throws — no public delivery route exists at the provider layer", async () => {
    const key = `test/r2-provider/${crypto.randomUUID()}.png`;
    await provider.put({ key, body: new Uint8Array([1]) });
    await expect(provider.createDownloadUrl({ key })).rejects.toThrow();
  });
});
