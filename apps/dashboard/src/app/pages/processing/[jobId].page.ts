import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type { ProcessingJob } from "@imageryx/sdk";
import { VoltButton } from "@voltui/components";
import { describeApiError } from "../../core/api/api-error";
import { AsyncStore } from "../../core/api/async-store";
import { formatDateTime } from "../../core/format/format";
import { NotificationService } from "../../core/notifications/notification.service";
import {
  isCancellable,
  isRetryable,
  isTerminal,
} from "../../core/processing/job-eligibility";
import { pollJobUntilTerminal } from "../../core/processing/job-poller";
import {
  describeJobInput,
  describeJobResult,
  describeJobType,
} from "../../core/processing/job-view";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { ErrorState } from "../../ui/error-state.component";
import { LoadingGrid } from "../../ui/loading-grid.component";
import { JobStatusBadge } from "./job-status-badge.component";

/**
 * `/processing/:jobId` — one job's own state, refreshed live while it's still queued or
 * processing. Polling stops the moment the job goes terminal, the tab is closed, or this page is
 * navigated away from (`DestroyRef.onDestroy`) — never a background timer outliving the view.
 */
@Component({
  selector: "ix-processing-job-page",
  standalone: true,
  imports: [RouterLink, VoltButton, ErrorState, LoadingGrid, JobStatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <a
        routerLink="/processing"
        class="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        ← Back to Processing
      </a>

      @if (store.isLoading()) {
        <ix-loading-grid [count]="1" layout="rows" label="Loading job…" />
      } @else if (store.error(); as error) {
        <ix-error-state [error]="error" (retry)="reload()" />
      } @else if (store.data(); as job) {
        <div class="flex flex-col gap-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex flex-col gap-1">
              <h1 class="text-2xl font-semibold text-foreground">
                {{ typeLabel(job) }}
              </h1>
              <p class="font-mono text-xs text-muted-foreground">
                {{ job.id }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <ix-job-status-badge [status]="job.status" />
              @if (retryable(job)) {
                <volt-button
                  variant="outline"
                  size="sm"
                  [disabled]="acting()"
                  (click)="retry(job)"
                  data-testid="job-detail-retry"
                >
                  Retry
                </volt-button>
              }
              @if (cancellable(job)) {
                <volt-button
                  variant="ghost"
                  size="sm"
                  [disabled]="acting()"
                  (click)="cancel(job)"
                  data-testid="job-detail-cancel"
                >
                  Cancel
                </volt-button>
              }
            </div>
          </div>

          @if (job.status === "failed" && (job.errorMessage || job.errorCode)) {
            <div
              class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
              role="alert"
              data-testid="job-error"
            >
              <p class="font-medium text-destructive">
                {{ job.errorMessage ?? "The job failed." }}
              </p>
              @if (job.errorCode) {
                <p class="mt-1 font-mono text-xs text-muted-foreground">
                  {{ job.errorCode }}
                </p>
              }
            </div>
          }

          <section
            class="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"
          >
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                What this job does
              </dt>
              <dd class="text-sm">{{ inputSummary(job) }}</dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">Result</dt>
              <dd class="text-sm">
                {{ resultSummary(job) ?? "Not available yet." }}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">Asset</dt>
              <dd class="text-sm">
                @if (job.assetId) {
                  <a
                    [routerLink]="['/library', job.assetId]"
                    class="underline-offset-2 hover:underline"
                  >
                    Open asset
                  </a>
                } @else {
                  —
                }
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                Provider
              </dt>
              <dd class="text-sm">{{ job.provider ?? "—" }}</dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">
                Attempts
              </dt>
              <dd class="text-sm">{{ job.attempts }}</dd>
            </div>
            <div>
              <dt class="text-xs font-medium text-muted-foreground">Created</dt>
              <dd class="text-sm">{{ formatDateTime(job.createdAt) }}</dd>
            </div>
            @if (job.startedAt) {
              <div>
                <dt class="text-xs font-medium text-muted-foreground">
                  Started
                </dt>
                <dd class="text-sm">{{ formatDateTime(job.startedAt) }}</dd>
              </div>
            }
            @if (job.completedAt) {
              <div>
                <dt class="text-xs font-medium text-muted-foreground">
                  Completed
                </dt>
                <dd class="text-sm">{{ formatDateTime(job.completedAt) }}</dd>
              </div>
            }
            @if (job.failedAt) {
              <div>
                <dt class="text-xs font-medium text-muted-foreground">
                  Failed
                </dt>
                <dd class="text-sm">{{ formatDateTime(job.failedAt) }}</dd>
              </div>
            }
          </section>

          <section class="flex flex-col gap-2">
            <volt-button
              variant="ghost"
              size="sm"
              (click)="toggleRaw()"
              data-testid="job-raw-toggle"
            >
              {{ showRaw() ? "Hide raw job data" : "Show raw job data" }}
            </volt-button>
            @if (showRaw()) {
              <pre
                class="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
                data-testid="job-raw-data"
                >{{ rawJson(job) }}</pre
              >
            }
          </section>
        </div>
      }
    </div>
  `,
})
export default class ProcessingJobPage {
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly store = new AsyncStore<ProcessingJob>({
    keepDataOnRefreshError: true,
  });
  protected readonly showRaw = signal(false);
  protected readonly acting = signal(false);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: null,
  });
  private readonly jobId = computed(() => this.params()?.get("jobId") ?? null);

  private stopPolling: (() => void) | null = null;

  constructor() {
    let loadedJobId: string | null = null;
    effect(() => {
      const id = this.jobId();
      if (!id || id === loadedJobId) return;
      loadedJobId = id;
      untracked(() => void this.load(id));
    });

    this.destroyRef.onDestroy(() => this.stopPolling?.());
  }

  private async load(jobId: string): Promise<void> {
    this.stopPolling?.();
    const job = await this.store.load(() => this.client.processing.get(jobId));
    if (job && !isTerminal(job.status)) this.beginPolling(jobId);
  }

  private beginPolling(jobId: string): void {
    const handle = pollJobUntilTerminal(
      () => this.client.processing.get(jobId),
      (job) => this.store.patch(() => job),
    );
    this.stopPolling = handle.stop;
  }

  protected async reload(): Promise<void> {
    const id = this.jobId();
    if (id) await this.load(id);
  }

  protected typeLabel(job: ProcessingJob): string {
    return describeJobType(job.type);
  }

  protected inputSummary(job: ProcessingJob): string {
    return describeJobInput(job.input);
  }

  protected resultSummary(job: ProcessingJob): string | null {
    return describeJobResult(job.result);
  }

  protected retryable(job: ProcessingJob): boolean {
    return isRetryable(job.status);
  }

  protected cancellable(job: ProcessingJob): boolean {
    return isCancellable(job.status);
  }

  protected formatDateTime(iso: string | null): string {
    return formatDateTime(iso);
  }

  protected toggleRaw(): void {
    this.showRaw.update((value) => !value);
  }

  protected rawJson(job: ProcessingJob): string {
    return JSON.stringify({ input: job.input, result: job.result }, null, 2);
  }

  protected async retry(job: ProcessingJob): Promise<void> {
    this.acting.set(true);
    try {
      const updated = await this.client.processing.retry(job.id);
      this.store.patch(() => updated);
      if (!isTerminal(updated.status)) this.beginPolling(job.id);
      this.notifications.success("Job retried", "The job was re-queued.");
    } catch (error) {
      const info = describeApiError(error);
      this.notifications.error(info.title, info.detail);
    } finally {
      this.acting.set(false);
    }
  }

  protected async cancel(job: ProcessingJob): Promise<void> {
    this.acting.set(true);
    try {
      const updated = await this.client.processing.cancel(job.id);
      this.store.patch(() => updated);
      this.stopPolling?.();
      this.notifications.success("Job cancelled", "The job will not run.");
    } catch (error) {
      const info = describeApiError(error);
      this.notifications.error(info.title, info.detail);
    } finally {
      this.acting.set(false);
    }
  }
}
