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
