import { computed, inject, Injectable, signal } from "@angular/core";
import type { ImageAsset } from "@imageryx/sdk";
import { describeApiError, type ApiErrorInfo } from "../api/api-error";
import { IMAGERYX_CLIENT } from "../sdk/imageryx-client.token";

export type UploadItemStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export interface UploadItem {
  /** Stable per-attempt id — a file name is not unique enough to key a list on. */
  readonly id: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  status: UploadItemStatus;
  assetId: string | null;
  error: ApiErrorInfo | null;
  /** Populated when the API reports another asset with an identical checksum. */
  duplicateOfPath: string | null;
  securityWarnings: string[];
}

export interface UploadRequest {
  projectId: string;
  folderId: string | null;
  visibility: "public" | "private";
  tags: string[];
  downloadOriginalEnabled: boolean;
}

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 45_000;

/**
 * Owns the upload queue and the *scoped* wait for each uploaded asset to finish processing.
 *
 * Root-provided because two different places start uploads (the topbar button and the library's
 * own empty state) while a third — the library list — needs to know when one finishes. A
 * shared service beats passing callbacks through the component tree or refetching on a timer.
 *
 * Files upload **sequentially**, not in parallel: each one is a full multipart body, and firing
 * ten at once at a local worker mostly produces contention rather than throughput.
 */
@Injectable({ providedIn: "root" })
export class UploadService {
  private readonly client = inject(IMAGERYX_CLIENT);

  private readonly items = signal<UploadItem[]>([]);
  private readonly busy = signal(false);
  /** Bumped whenever an asset reaches a terminal state, so the library can refresh exactly once. */
  private readonly settledCounter = signal(0);

  readonly queue = this.items.asReadonly();
  readonly isUploading = this.busy.asReadonly();
  readonly settledAt = this.settledCounter.asReadonly();

  readonly activeCount = computed(
    () =>
      this.items().filter(
        (i) => i.status === "queued" || i.status === "uploading",
      ).length,
  );
  readonly failedCount = computed(
    () => this.items().filter((i) => i.status === "failed").length,
  );
  readonly readyCount = computed(
    () => this.items().filter((i) => i.status === "ready").length,
  );

  clear(): void {
    if (this.busy()) return;
    this.items.set([]);
  }

  /**
   * Uploads each file in turn. Resolves once every file has been *uploaded* — waiting for
   * processing continues in the background, so the dialog can close without abandoning it.
   */
  async upload(files: readonly File[], request: UploadRequest): Promise<void> {
    if (files.length === 0 || this.busy()) return;

    const queued: UploadItem[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      sizeBytes: file.size,
      status: "queued",
      assetId: null,
      error: null,
      duplicateOfPath: null,
      securityWarnings: [],
    }));
    this.items.update((current) => [...current, ...queued]);
    this.busy.set(true);

    try {
      for (const [index, file] of files.entries()) {
        const item = queued[index];
        if (!item) continue;
        await this.uploadOne(file, item.id, request);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async uploadOne(
    file: File,
    itemId: string,
    request: UploadRequest,
  ): Promise<void> {
    this.patchItem(itemId, { status: "uploading" });

    try {
      const result = await this.client.assets.upload({
        projectId: request.projectId,
        folderId: request.folderId,
        file,
        visibility: request.visibility,
        tags: request.tags.length > 0 ? request.tags : undefined,
        downloadOriginalEnabled: request.downloadOriginalEnabled,
      });

      this.patchItem(itemId, {
        status: "processing",
        assetId: result.asset.id,
        duplicateOfPath: result.duplicateCandidates[0]?.path ?? null,
        securityWarnings: result.securityWarnings,
      });

      // Deliberately not awaited: processing runs off the request path, and the user should be
      // able to close the dialog and keep working while it finishes.
      void this.waitUntilSettled(itemId, result.asset.id);
    } catch (error) {
      this.patchItem(itemId, {
        status: "failed",
        error: describeApiError(error),
      });
      this.settledCounter.update((n) => n + 1);
    }
  }

  /**
   * Polls **one asset by id** until it leaves the pending/processing states.
   *
   * Scoped this narrowly on purpose: re-listing the whole library on a timer to discover one
   * asset's status is the easy version and generates traffic proportional to library size rather
   * than to what actually changed. Polling stops on a terminal status, on a bounded timeout, and
   * while the tab is hidden — a backgrounded dashboard should be silent.
   */
  private async waitUntilSettled(
    itemId: string,
    assetId: string,
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      if (isDocumentHidden()) continue;

      let asset: ImageAsset;
      try {
        asset = await this.client.assets.get(assetId);
      } catch (error) {
        this.patchItem(itemId, {
          status: "failed",
          error: describeApiError(error),
        });
        this.settledCounter.update((n) => n + 1);
        return;
      }

      if (asset.processingStatus === "ready") {
        this.patchItem(itemId, { status: "ready" });
        this.settledCounter.update((n) => n + 1);
        return;
      }
      if (asset.processingStatus === "failed") {
        this.patchItem(itemId, {
          status: "failed",
          error: {
            kind: "server",
            title: "Processing failed",
            detail:
              "The upload succeeded but the processing job failed. Check the Processing page for details.",
            code: null,
            requestId: null,
            retryable: false,
          },
        });
        this.settledCounter.update((n) => n + 1);
        return;
      }
    }

    // Timed out while still pending. The asset exists and the job may yet succeed, so this is
    // reported as "still processing", never as a failure we cannot substantiate.
    this.settledCounter.update((n) => n + 1);
  }

  private patchItem(itemId: string, patch: Partial<UploadItem>): void {
    this.items.update((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}
