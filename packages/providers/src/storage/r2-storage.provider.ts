import type { R2Bucket, R2Object } from "@cloudflare/workers-types";
import type { StorageProviderName } from "@imageryx/contracts";
import { ProviderUnavailableError } from "@imageryx/image-core";
import type {
  DownloadUrlInput,
  StorageProvider,
  StoragePutInput,
  StoredObject,
  StoredObjectBody,
  StoredObjectMetadata,
} from "./storage-provider";

function mapR2Object(object: R2Object): StoredObject {
  return {
    key: object.key,
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? null,
    etag: object.etag,
    uploadedAt: object.uploaded.toISOString(),
  };
}

/**
 * Dependency-injected with an `R2Bucket` binding — never constructs one
 * itself and never calls the Cloudflare REST API. Phase 2 explicitly
 * excludes real R2 uploads; this compiles against the real binding type
 * and is structurally ready, but is not exercised against a live bucket
 * until a later phase wires it into a Worker's bindings.
 */
export class R2StorageProvider implements StorageProvider {
  readonly name: StorageProviderName = "r2";

  constructor(private readonly bucket: R2Bucket) {}

  async put(input: StoragePutInput): Promise<StoredObject> {
    // `StorageBody`'s `ReadableStream<Uint8Array>` (from the standard/Node lib) and workerd's own
    // `ReadableStream` (declared by `@cloudflare/workers-types`) are two distinct ambient
    // declarations of the same runtime object shape — structurally close but not identical, so
    // TS won't unify them automatically. This is a known cross-typing friction, not a real risk:
    // at runtime this always executes inside a Worker, where only workerd's ReadableStream exists.
    const body = input.body as unknown as Parameters<R2Bucket["put"]>[1];
    const object = await this.bucket.put(input.key, body, {
      httpMetadata: input.contentType
        ? { contentType: input.contentType }
        : undefined,
    });
    return mapR2Object(object);
  }

  async get(key: string): Promise<StoredObjectBody | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    // Same ReadableStream identity mismatch as in `put()`, in reverse.
    return {
      ...mapR2Object(object),
      body: object.body as unknown as ReadableStream<Uint8Array>,
    };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    const object = await this.bucket.head(key);
    return object ? mapR2Object(object) : null;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /** No public delivery route exists yet (Phase 3+ scope) — there is nothing to generate a real download URL against. */
  async createDownloadUrl(_input: DownloadUrlInput): Promise<string> {
    throw new ProviderUnavailableError(
      "R2 download URL generation requires a delivery route, not implemented until a later phase",
    );
  }
}
