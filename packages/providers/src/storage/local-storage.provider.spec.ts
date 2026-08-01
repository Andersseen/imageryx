import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidImagePathError } from "@imageryx/image-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "./local-storage.provider";

async function readAllChunks(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
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

describe("LocalStorageProvider", () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "imageryx-storage-test-"));
    provider = new LocalStorageProvider({ rootDirectory: root });
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it("writes and reads back an object, creating parent directories automatically", async () => {
    const bytes = new TextEncoder().encode("hello imageryx");
    const put = await provider.put({
      key: "originals/project-1/asset-1/original.png",
      body: bytes,
      contentType: "image/png",
    });
    expect(put.size).toBe(bytes.byteLength);
    expect(put.contentType).toBe("image/png");

    const got = await provider.get("originals/project-1/asset-1/original.png");
    expect(got).not.toBeNull();
    const readBytes = await readAllChunks(got!.body);
    expect(new TextDecoder().decode(readBytes)).toBe("hello imageryx");
  });

  it("actually wrote the file under the configured root", async () => {
    await provider.put({ key: "a/b.txt", body: new TextEncoder().encode("x") });
    const onDisk = await readFile(join(root, "a/b.txt"));
    expect(onDisk.toString()).toBe("x");
  });

  it("head() returns metadata without a body", async () => {
    await provider.put({
      key: "a.png",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    const meta = await provider.head("a.png");
    expect(meta).toEqual(
      expect.objectContaining({
        key: "a.png",
        size: 3,
        contentType: "image/png",
      }),
    );
  });

  it("exists() reflects put/delete", async () => {
    await provider.put({ key: "a.png", body: new Uint8Array([1]) });
    expect(await provider.exists("a.png")).toBe(true);
    await provider.delete("a.png");
    expect(await provider.exists("a.png")).toBe(false);
  });

  it("returns null from get()/head() for a missing object rather than throwing", async () => {
    expect(await provider.get("missing.png")).toBeNull();
    expect(await provider.head("missing.png")).toBeNull();
  });

  it("supports a nested opaque key several segments deep", async () => {
    await provider.put({
      key: "derived/proj/asset/hash123.webp",
      body: new Uint8Array([9, 9]),
    });
    expect(await provider.exists("derived/proj/asset/hash123.webp")).toBe(true);
  });

  it("rejects a key that attempts to traverse outside the configured root", async () => {
    await expect(
      provider.put({ key: "../../etc/passwd", body: new Uint8Array([1]) }),
    ).rejects.toThrow(InvalidImagePathError);
  });

  it("rejects an absolute-path key rather than letting it override the configured root", async () => {
    // `path.resolve(root, key)` treats an absolute second argument as the whole result, discarding
    // `root` entirely — the exact bypass this check exists to catch, not a hypothetical.
    await expect(
      provider.put({ key: "/etc/passwd", body: new Uint8Array([1]) }),
    ).rejects.toThrow(InvalidImagePathError);
  });

  it("rejects a key containing a null byte instead of writing a malformed path", async () => {
    await expect(
      provider.put({ key: "a" + String.fromCharCode(0) + ".png", body: new Uint8Array([1]) }),
    ).rejects.toThrow();
  });

  it("never deletes anything when the resolved path is the storage root itself", async () => {
    await provider.put({ key: "keep-me.png", body: new Uint8Array([1]) });
    // An empty key resolves to `this.root` unchanged — must be rejected before reaching `rm()`.
    await expect(provider.delete("")).rejects.toThrow(InvalidImagePathError);
    expect(await provider.exists("keep-me.png")).toBe(true);
  });

  it("generates a deterministic local download reference for an existing object", async () => {
    await provider.put({ key: "a.png", body: new Uint8Array([1]) });
    const url = await provider.createDownloadUrl({ key: "a.png" });
    expect(url).toContain("a.png");
    expect(url.startsWith("file://")).toBe(true);
  });

  it("rejects generating a download URL for a missing object", async () => {
    await expect(
      provider.createDownloadUrl({ key: "missing.png" }),
    ).rejects.toThrow();
  });

  it("accepts a ReadableStream body", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed"));
        controller.close();
      },
    });
    await provider.put({ key: "stream.txt", body: stream });
    const got = await provider.get("stream.txt");
    const bytes = await readAllChunks(got!.body);
    expect(new TextDecoder().decode(bytes)).toBe("streamed");
  });
});
