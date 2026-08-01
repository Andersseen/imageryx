import type { StorageProviderName } from "@imageryx/contracts";

/** Web Streams / typed-array body only — never Node's `Buffer` — so the same interface works unchanged in Workers and Node. */
export type StorageBody = ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer;

export interface StoragePutInput {
  key: string;
  body: StorageBody;
  contentType?: string;
}

export interface StoredObjectMetadata {
  key: string;
  size: number;
  contentType: string | null;
  etag: string | null;
  uploadedAt: string;
}

export type StoredObject = StoredObjectMetadata;

export interface StoredObjectBody extends StoredObjectMetadata {
  body: ReadableStream<Uint8Array>;
}

export interface DownloadUrlInput {
  key: string;
  expiresInSeconds?: number;
}

export interface StorageProvider {
  readonly name: StorageProviderName;

  put(input: StoragePutInput): Promise<StoredObject>;

  get(key: string): Promise<StoredObjectBody | null>;

  head(key: string): Promise<StoredObjectMetadata | null>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  createDownloadUrl(input: DownloadUrlInput): Promise<string>;
}

/**
 * Every implementation of `StorageProvider.put()` must accept all three
 * `StorageBody` variants — that's the point of the union — but at least
 * one real backend (R2's `bucket.put()`) rejects a `ReadableStream` with
 * no known length outright, so a stream body has to be buffered before it
 * reaches that call. Shared here rather than duplicated per provider.
 */
export async function readStorageBodyToBytes(body: StorageBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);

  const reader = body.getReader();
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
