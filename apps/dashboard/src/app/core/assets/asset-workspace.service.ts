import { computed, inject, Injectable, signal } from "@angular/core";
import type { AssetDetails, ImageVariant } from "@imageryx/sdk";
import { describeApiError, type ApiErrorInfo } from "../api/api-error";
import { AsyncStore } from "../api/async-store";
import { IMAGERYX_CLIENT } from "../sdk/imageryx-client.token";

export type VariantRequestStatus =
  | "requesting"
  | "polling"
  | "ready"
  | "failed";

export interface VariantRequestState {
  presetId: string;
  status: VariantRequestStatus;
  jobId: string | null;
  error: ApiErrorInfo | null;
}

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 45_000;

/**
 * Owns one asset's full workspace state: the `AssetDetails` blob (metadata, variants, presets,
 * activity, delivery — one request covers the whole page, see `GET /v1/assets/:id`), plus every
 * mutation the workspace can make and the *scoped* polling that follows a variant request.
 *
 * Component-provided (`providers: [AssetWorkspaceService]` on the page), not root — a fresh
 * instance per asset visit means no stale state to reset when navigating from one asset to
 * another, and the poll timers are torn down automatically when Angular destroys the service.
 */
@Injectable()
export class AssetWorkspaceService {
  private readonly client = inject(IMAGERYX_CLIENT);

  private readonly assetId = signal<string | null>(null);
  readonly details = new AsyncStore<AssetDetails>({
    keepDataOnRefreshError: true,
  });

  /** One entry per preset currently being generated or just settled, keyed by preset id — so the UI can show "already in flight" for a preset without a second request. */
  private readonly variantRequests = signal<Map<string, VariantRequestState>>(
    new Map(),
  );
  readonly requestsByPreset = computed(() => this.variantRequests());

  readonly asset = computed(() => this.details.data());

  async load(assetId: string): Promise<void> {
    this.assetId.set(assetId);
    this.variantRequests.set(new Map());
    await this.details.load(() => this.client.assets.get(assetId));
  }

  async refresh(): Promise<void> {
    const id = this.assetId();
    if (!id) return;
    await this.details.load(() => this.client.assets.get(id));
  }

  private currentId(): string {
    const id = this.assetId();
    if (!id) throw new Error("AssetWorkspaceService used before load()");
    return id;
  }

  // ---------------------------------------------------------------------------
  // Settings mutations — each refetches the full detail blob afterward. The asset is a single
  // record with modest fan-out (a handful of variants, a bounded activity list), so a refetch
  // here is one small request, not the "reload all library data" pattern the phase spec warns
  // against for the *list* page.
  // ---------------------------------------------------------------------------

  async updateSettings(patch: {
    name?: string;
    slug?: string;
    visibility?: "public" | "private";
    downloadOriginalEnabled?: boolean;
  }): Promise<{ ok: true } | { ok: false; error: ApiErrorInfo }> {
    try {
      await this.client.assets.update(this.currentId(), patch);
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describeApiError(error) };
    }
  }

  async move(
    folderId: string | null,
  ): Promise<{ ok: true } | { ok: false; error: ApiErrorInfo }> {
    try {
      await this.client.assets.move(this.currentId(), folderId);
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describeApiError(error) };
    }
  }

  async setTags(
    tags: string[],
  ): Promise<{ ok: true } | { ok: false; error: ApiErrorInfo }> {
    try {
      await this.client.assets.setTags(this.currentId(), tags);
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describeApiError(error) };
    }
  }

  async softDelete(): Promise<
    { ok: true } | { ok: false; error: ApiErrorInfo }
  > {
    try {
      await this.client.assets.delete(this.currentId());
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describeApiError(error) };
    }
  }

  async restore(): Promise<{ ok: true } | { ok: false; error: ApiErrorInfo }> {
    try {
      await this.client.assets.restore(this.currentId());
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describeApiError(error) };
    }
  }

  async createDownloadUrl(
    variant: string,
    expiresIn: number,
  ): Promise<
    | { ok: true; url: string; expiresAt: string }
    | { ok: false; error: ApiErrorInfo }
  > {
    try {
      const result = await this.client.assets.createDownloadUrl(
        this.currentId(),
        {
          variant,
          expiresIn,
        },
      );
      return { ok: true, url: result.url, expiresAt: result.expiresAt };
    } catch (error) {
      return { ok: false, error: describeApiError(error) };
    }
  }

  // ---------------------------------------------------------------------------
  // Variant generation — request, then poll *only the resulting job*, never the whole asset or
  // library on a timer. Idempotent by construction: a repeat request for an already-ready or
  // already-pending preset returns the existing variant (see generate-variant.service.ts), which
  // this surfaces as an immediate settle rather than a second job.
  // ---------------------------------------------------------------------------

  isRequestActive(presetId: string): boolean {
    const state = this.variantRequests().get(presetId);
    return (
      state !== undefined &&
      state.status !== "ready" &&
      state.status !== "failed"
    );
  }

  async generateVariant(presetId: string, persist: boolean): Promise<void> {
    this.patchRequest(presetId, {
      presetId,
      status: "requesting",
      jobId: null,
      error: null,
    });

    try {
      const result = await this.client.variants.generate(this.currentId(), {
        presetId,
        persist,
      });
      await this.applyVariantToDetails(result.variant);

      if (result.status === "ready") {
        this.patchRequest(presetId, { status: "ready" });
        return;
      }

      const jobId = result.processingJobId;
      if (!jobId) {
        // A pending/processing variant with no active job id is a state this API never actually
        // produces (idempotent re-requests always carry the still-active job), but the type is
        // nullable — treat it as settled rather than polling nothing.
        this.patchRequest(presetId, { status: "ready" });
        return;
      }

      this.patchRequest(presetId, { status: "polling", jobId });
      await this.pollJob(presetId, jobId);
    } catch (error) {
      this.patchRequest(presetId, {
        status: "failed",
        error: describeApiError(error),
      });
    }
  }

  /**
   * Retries a failed variant's own job — the API's actual retry mechanism
   * (`POST /v1/processing-jobs/:jobId/retry`) is the only legal `failed -> pending` transition
   * for a variant (see `VARIANT_STATUS_TRANSITIONS`); calling `generateVariant` again would not
   * do that, since a failed variant is not the "already ready" or "already pending" fast path
   * `requestVariant` short-circuits on.
   */
  async retryJob(presetId: string, jobId: string): Promise<void> {
    this.patchRequest(presetId, { status: "requesting", jobId, error: null });
    try {
      await this.client.processing.retry(jobId);
      this.patchRequest(presetId, { status: "polling" });
      await this.pollJob(presetId, jobId);
    } catch (error) {
      this.patchRequest(presetId, {
        status: "failed",
        error: describeApiError(error),
      });
    }
  }

  private async pollJob(presetId: string, jobId: string): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      if (isDocumentHidden()) continue;

      let job;
      try {
        job = await this.client.processing.get(jobId);
      } catch (error) {
        this.patchRequest(presetId, {
          status: "failed",
          error: describeApiError(error),
        });
        return;
      }

      if (job.status === "completed") {
        await this.refreshVariantsAndActivity();
        this.patchRequest(presetId, { status: "ready" });
        return;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        await this.refreshVariantsAndActivity();
        this.patchRequest(presetId, {
          status: "failed",
          error: {
            kind: "server",
            title: "Variant generation failed",
            detail:
              job.errorMessage ??
              "The processing job did not complete successfully.",
            code: job.errorCode,
            requestId: null,
            retryable: false,
          },
        });
        return;
      }
    }

    // Timed out while still queued/processing — real work may still finish; report "still
    // processing," never a failure this function cannot substantiate.
    this.patchRequest(presetId, { status: "polling" });
  }

  /** Applies one variant's current state into the loaded `AssetDetails.variants` array without a full refetch. */
  private async applyVariantToDetails(variant: ImageVariant): Promise<void> {
    this.details.patch((current) => {
      const index = current.variants.findIndex((v) => v.id === variant.id);
      const variants =
        index === -1
          ? [...current.variants, variant]
          : current.variants.map((v, i) => (i === index ? variant : v));
      return { ...current, variants };
    });
  }

  /**
   * A job settling is exactly the moment the Activity tab's `variant.requested` /
   * `variant.processing` / `variant.ready` (or `processing.failed`) entries become real — refetch
   * both alongside it, still two small scoped requests rather than the full asset detail blob.
   */
  private async refreshVariantsAndActivity(): Promise<void> {
    const id = this.assetId();
    if (!id) return;
    try {
      const { items } = await this.client.assets.variants(id);
      this.details.patch((current) => ({ ...current, variants: items }));
    } catch {
      // A failed refresh here just means the variant list stays one poll cycle stale; the next
      // manual refresh corrects it, so this is not escalated to a page-level error.
    }
    try {
      const { items } = await this.client.assets.activity(id);
      this.details.patch((current) => ({ ...current, activity: items }));
    } catch {
      // Same story as above: the timeline just stays one cycle stale, not a page-level error.
    }
  }

  private patchRequest(
    presetId: string,
    patch: Partial<VariantRequestState>,
  ): void {
    this.variantRequests.update((current) => {
      const next = new Map(current);
      const existing = next.get(presetId);
      next.set(presetId, {
        presetId,
        status: "requesting",
        jobId: null,
        error: null,
        ...existing,
        ...patch,
      });
      return next;
    });
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
