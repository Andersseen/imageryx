import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { StorageProviderName } from "@imageryx/contracts";
import {
  InvalidImagePathError,
  computeSha256Checksum,
} from "@imageryx/image-core";
import {
  readStorageBodyToBytes,
  type DownloadUrlInput,
  type StorageProvider,
  type StoragePutInput,
  type StoredObject,
  type StoredObjectBody,
  type StoredObjectMetadata,
} from "./storage-provider";

interface SidecarMetadata {
  contentType: string | null;
  size: number;
  etag: string;
  uploadedAt: string;
}

export interface LocalStorageProviderOptions {
  /** Every object this provider ever reads or writes resolves under this directory — enforced on every call, never trusted from the key alone. */
  rootDirectory: string;
}

/**
 * Real filesystem-backed storage for local development and tests. Keys
 * are still expected to be the opaque values `@imageryx/image-core`'s
 * storage-key builders produce, but this provider re-validates independently
 * (defense in depth — it doesn't assume every caller already did).
 *
 * Metadata (content type, size, etag, upload time) has no filesystem-native
 * home, so it's kept in a `<key>.meta.json` sidecar next to each object.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = "local";
  private readonly root: string;

  constructor(options: LocalStorageProviderOptions) {
    this.root = resolve(options.rootDirectory);
  }

  private resolveObjectPath(key: string): string {
    if (key.length === 0) {
      throw new InvalidImagePathError("storage key must not be empty");
    }
    const resolved = resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(this.root + sep)) {
      throw new InvalidImagePathError(
        `storage key "${key}" resolves outside the configured local storage root`,
      );
    }
    return resolved;
  }

  private sidecarPath(objectPath: string): string {
    return `${objectPath}.meta.json`;
  }

  private async readSidecar(
    objectPath: string,
  ): Promise<SidecarMetadata | null> {
    try {
      const raw = await readFile(this.sidecarPath(objectPath), "utf-8");
      return JSON.parse(raw) as SidecarMetadata;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async put(input: StoragePutInput): Promise<StoredObject> {
    const objectPath = this.resolveObjectPath(input.key);
    await mkdir(dirname(objectPath), { recursive: true });

    const bytes = await readStorageBodyToBytes(input.body);
    const etag = await computeSha256Checksum(bytes);
    const uploadedAt = new Date().toISOString();
    const metadata: SidecarMetadata = {
      contentType: input.contentType ?? null,
      size: bytes.byteLength,
      etag,
      uploadedAt,
    };

    const tempSuffix = `.tmp-${crypto.randomUUID()}`;
    await writeFile(objectPath + tempSuffix, bytes);
    await rename(objectPath + tempSuffix, objectPath);
    await writeFile(this.sidecarPath(objectPath), JSON.stringify(metadata));

    return { key: input.key, ...metadata };
  }

  async get(key: string): Promise<StoredObjectBody | null> {
    const objectPath = this.resolveObjectPath(key);
    const metadata = await this.readSidecar(objectPath);
    if (!metadata) return null;

    let bytes: Uint8Array;
    try {
      bytes = await readFile(objectPath);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }

    return { key, ...metadata, body: bytesToStream(bytes) };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    const objectPath = this.resolveObjectPath(key);
    const metadata = await this.readSidecar(objectPath);
    return metadata ? { key, ...metadata } : null;
  }

  async delete(key: string): Promise<void> {
    const objectPath = this.resolveObjectPath(key);
    await rm(objectPath, { force: true });
    await rm(this.sidecarPath(objectPath), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /**
   * No local HTTP server exists in Phase 2 (`delivery-worker`'s real
   * asset-serving route is Phase 3 scope) — this returns a deterministic
   * `file://` URL to the object on disk, not a fetchable HTTP endpoint.
   */
  async createDownloadUrl(input: DownloadUrlInput): Promise<string> {
    const objectPath = this.resolveObjectPath(input.key);
    const metadata = await this.readSidecar(objectPath);
    if (!metadata) {
      throw new InvalidImagePathError(
        `no local object exists for key "${input.key}"`,
      );
    }
    return `file://${objectPath}`;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
