import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  untracked,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import type { PaginatedResponse, ProcessingJob } from "@imageryx/sdk";
import { VoltButton, VoltLabel, VoltNativeSelect } from "@voltui/components";
import { LmnArrowPathIcon, LmnXMarkIcon } from "lumen-icons";
import { describeApiError } from "../../core/api/api-error";
import { AsyncStore } from "../../core/api/async-store";
import { formatRelativeTime, shortId } from "../../core/format/format";
import { NotificationService } from "../../core/notifications/notification.service";
import {
  isCancellable,
  isRetryable,
  isTerminal,
} from "../../core/processing/job-eligibility";
import {
  type JobPollHandle,
  pollJobUntilTerminal,
} from "../../core/processing/job-poller";
import { describeJobType } from "../../core/processing/job-view";
import {
  applyQueryChange,
  clearFilters,
  hasActiveFilters,
  parseProcessingQuery,
  PROCESSING_STATUSES,
  PROCESSING_TYPES,
  toListParams,
  toUrlParams,
  type ProcessingQuery,
} from "../../core/processing/processing-query";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { EmptyState } from "../../ui/empty-state.component";
import { ErrorState } from "../../ui/error-state.component";
import { LoadingGrid } from "../../ui/loading-grid.component";
import { PageHeader } from "../../ui/page-header.component";
import { Pager } from "../../ui/pager.component";
import { JobStatusBadge } from "./job-status-badge.component";

type JobPage = PaginatedResponse<ProcessingJob>;

/**
 * The processing dashboard: every job for the selected project, filtered by status/type — the
 * only two filters the API actually supports (`GET /v1/processing-jobs`); there is no "provider"
 * filter here even though an earlier placeholder mentioned one, because the route never accepts
 * it.
 *
 * Polling is per-row, not page-level: each visible non-terminal job gets its own
 * `pollJobUntilTerminal` instance (see that module), reconciled against whichever jobs are
 * currently loaded. Paginating, filtering, refreshing, or navigating away stops the pollers for
 * whatever is no longer visible — nothing here ever refetches the whole list on a timer.
 */
@Component({
  selector: "ix-processing-page",
  standalone: true,
  imports: [
    RouterLink,
    VoltButton,
    VoltLabel,
    VoltNativeSelect,
    LmnArrowPathIcon,
    LmnXMarkIcon,
    EmptyState,
    ErrorState,
    LoadingGrid,
    PageHeader,
    Pager,
    JobStatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ix-page-header
        title="Processing"
        description="Transformation and maintenance jobs run by the Processing Worker's queue consumer."
      >
        <volt-button
          variant="outline"
          size="sm"
          [disabled]="jobs.isBusy()"
          (click)="refresh()"
          data-testid="processing-refresh"
        >
          <lmn-arrow-path slot="leading" [size]="14" />
          Refresh
        </volt-button>
      </ix-page-header>

      @if (!context.selectedProjectId()) {
        @if (context.projectsLoading()) {
          <ix-loading-grid
            [count]="6"
            layout="rows"
            label="Loading projects…"
          />
        } @else if (context.projectsError(); as error) {
          <ix-error-state [error]="error" (retry)="reloadProjects()" />
        } @else {
          <ix-empty-state
            title="No project selected"
            description="Processing jobs belong to a project. Select one to see its queue."
          >
            <a routerLink="/projects">
              <volt-button variant="solid" size="sm"
                >Go to Projects</volt-button
              >
            </a>
          </ix-empty-state>
        }
      } @else {
        <div
          class="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
          role="group"
          aria-label="Job filters"
        >
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="filter-status">Status</volt-label>
            <select voltNativeSelect
              id="filter-status"
              (change)="
                updateQuery({ status: $any($event.target).value || null })
              "
              data-testid="filter-status"
            >
              <option value="" [selected]="query().status === null">
                Any status
              </option>
              @for (status of statuses; track status) {
                <option [value]="status" [selected]="query().status === status">
                  {{ status }}
                </option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="filter-type">Type</volt-label>
            <select voltNativeSelect
              id="filter-type"
              (change)="
                updateQuery({ type: $any($event.target).value || null })
              "
              data-testid="filter-type"
            >
              <option value="" [selected]="query().type === null">
                Any type
              </option>
              @for (type of types; track type) {
                <option [value]="type" [selected]="query().type === type">
                  {{ typeLabel(type) }}
                </option>
              }
            </select>
          </div>
          @if (isFiltered()) {
            <volt-button
              variant="ghost"
              size="sm"
              (click)="onClearFilters()"
              data-testid="filter-clear"
            >
              <lmn-x-mark slot="leading" [size]="14" />
              Clear filters
            </volt-button>
          }
        </div>

        @if (jobs.isLoading()) {
          <ix-loading-grid [count]="8" layout="rows" label="Loading jobs…" />
        } @else if (jobs.error(); as error) {
          <ix-error-state [error]="error" (retry)="refresh()" />
        } @else if (items().length === 0) {
          @if (isFiltered()) {
            <ix-empty-state
              title="No jobs match these filters"
              description="Nothing in this project's queue matches the current filter combination."
            >
              <volt-button
                variant="outline"
                size="sm"
                (click)="onClearFilters()"
                >Clear filters</volt-button
              >
            </ix-empty-state>
          } @else {
            <ix-empty-state
              title="No processing jobs yet"
              description="Jobs appear here once an upload or variant request dispatches one."
            />
          }
        } @else {
          <div class="overflow-x-auto rounded-lg border border-border">
            <table
              class="w-full min-w-[50rem] border-collapse text-sm"
              data-testid="job-table"
            >
              <caption class="sr-only">
                Processing jobs
              </caption>
              <thead>
                <tr class="border-b border-border bg-muted/40 text-left">
                  <th scope="col" class="px-3 py-2 font-medium">Job</th>
                  <th scope="col" class="px-3 py-2 font-medium">Status</th>
                  <th scope="col" class="px-3 py-2 font-medium">Asset</th>
                  <th scope="col" class="px-3 py-2 font-medium">Attempts</th>
                  <th scope="col" class="px-3 py-2 font-medium">Created</th>
                  <th scope="col" class="px-3 py-2 font-medium">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (job of items(); track job.id) {
                  <tr
                    class="border-b border-border last:border-0"
                    data-testid="job-row"
                  >
                    <td class="px-3 py-2">
                      <a
                        [routerLink]="['/processing', job.id]"
                        class="flex flex-col underline-offset-2 hover:underline"
                      >
                        <span class="font-medium">{{
                          typeLabel(job.type)
                        }}</span>
                        <span class="font-mono text-xs text-muted-foreground">{{
                          shortId(job.id)
                        }}</span>
                      </a>
                    </td>
                    <td class="px-3 py-2">
                      <ix-job-status-badge [status]="job.status" />
                      @if (job.status === "failed" && job.errorMessage) {
                        <p class="mt-1 max-w-xs text-xs text-destructive">
                          {{ job.errorMessage }}
                        </p>
                      }
                    </td>
                    <td class="px-3 py-2 text-muted-foreground">
                      @if (job.assetId) {
                        <a
                          [routerLink]="['/library', job.assetId]"
                          class="underline-offset-2 hover:underline"
                        >
                          {{ shortId(job.assetId) }}
                        </a>
                      } @else {
                        —
                      }
                    </td>
                    <td class="px-3 py-2 text-muted-foreground">
                      {{ job.attempts }}
                    </td>
                    <td class="px-3 py-2 text-muted-foreground">
                      {{ createdLabel(job) }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      <div class="flex justify-end gap-2">
                        @if (retryable(job)) {
                          <volt-button
                            variant="outline"
                            size="sm"
                            [disabled]="isBusy(job.id)"
                            (click)="retryJob(job)"
                            data-testid="job-retry"
                          >
                            Retry
                          </volt-button>
                        }
                        @if (cancellable(job)) {
                          <volt-button
                            variant="ghost"
                            size="sm"
                            [disabled]="isBusy(job.id)"
                            (click)="cancelJob(job)"
                            data-testid="job-cancel"
                          >
                            Cancel
                          </volt-button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <ix-pager
            [page]="page().page"
            [pageSize]="page().pageSize"
            [total]="page().total"
            itemLabel="jobs"
            (pageChange)="updateQuery({ page: $event })"
          />
        }
      }
    </div>
  `,
})
export default class ProcessingPage {
  protected readonly context = inject(ProjectContextService);
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly jobs = new AsyncStore<JobPage>({
    keepDataOnRefreshError: true,
  });
  protected readonly statuses = PROCESSING_STATUSES;
  protected readonly types = PROCESSING_TYPES;

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: null,
  });
  protected readonly query = computed<ProcessingQuery>(() => {
    const params = this.queryParams();
    if (!params) return parseProcessingQuery({});
    const record: Record<string, string | null> = {};
    for (const key of params.keys) record[key] = params.get(key);
    return parseProcessingQuery(record);
  });

  protected readonly page = computed<JobPage>(
    () =>
      this.jobs.data() ?? {
        items: [],
        page: 1,
        pageSize: 24,
        total: 0,
        totalPages: 1,
      },
  );
  protected readonly items = computed(() => this.page().items);
  protected readonly isFiltered = computed(() =>
    hasActiveFilters(this.query()),
  );

  /** Job ids with a retry/cancel request in flight — disables their buttons against a double click. */
  private readonly busyIds = new Set<string>();
  private readonly pollers = new Map<string, JobPollHandle>();
  private lastFetchKey: string | null = null;

  constructor() {
    void this.context.ensureLoaded();

    effect(() => {
      const projectId = this.context.selectedProjectId();
      const query = this.query();
      if (!projectId) {
        untracked(() => this.jobs.reset());
        this.lastFetchKey = null;
        this.stopAllPolling();
        return;
      }

      const key = `${projectId}|${JSON.stringify(toListParams(query))}`;
      if (key === this.lastFetchKey) return;
      this.lastFetchKey = key;
      untracked(() => void this.fetch(projectId, query));
    });

    this.destroyRef.onDestroy(() => this.stopAllPolling());
  }

  private async fetch(
    projectId: string,
    query: ProcessingQuery,
  ): Promise<void> {
    await this.jobs.load(() =>
      this.client.processing.list(projectId, toListParams(query)),
    );
    this.syncPolling();
  }

  protected async refresh(): Promise<void> {
    const projectId = this.context.selectedProjectId();
    if (!projectId) return;
    await this.fetch(projectId, this.query());
  }

  protected async reloadProjects(): Promise<void> {
    await this.context.reloadProjects();
  }

  protected updateQuery(change: Partial<ProcessingQuery>): void {
    this.navigateTo(applyQueryChange(this.query(), change));
  }

  protected onClearFilters(): void {
    this.navigateTo(clearFilters(this.query()));
  }

  private navigateTo(next: ProcessingQuery): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toUrlParams(next),
      replaceUrl: true,
    });
  }

  protected typeLabel(type: ProcessingJob["type"]): string {
    return describeJobType(type);
  }

  protected shortId(id: string): string {
    return shortId(id);
  }

  protected createdLabel(job: ProcessingJob): string {
    return formatRelativeTime(job.createdAt);
  }

  protected retryable(job: ProcessingJob): boolean {
    return isRetryable(job.status);
  }

  protected cancellable(job: ProcessingJob): boolean {
    return isCancellable(job.status);
  }

  protected isBusy(jobId: string): boolean {
    return this.busyIds.has(jobId);
  }

  protected async retryJob(job: ProcessingJob): Promise<void> {
    this.busyIds.add(job.id);
    try {
      const updated = await this.client.processing.retry(job.id);
      this.applyJobUpdate(updated);
      this.syncPolling();
    } catch (error) {
      const info = describeApiError(error);
      this.notifications.error(info.title, info.detail);
    } finally {
      this.busyIds.delete(job.id);
    }
  }

  protected async cancelJob(job: ProcessingJob): Promise<void> {
    this.busyIds.add(job.id);
    try {
      const updated = await this.client.processing.cancel(job.id);
      this.applyJobUpdate(updated);
      this.syncPolling();
    } catch (error) {
      const info = describeApiError(error);
      this.notifications.error(info.title, info.detail);
    } finally {
      this.busyIds.delete(job.id);
    }
  }

  private applyJobUpdate(job: ProcessingJob): void {
    this.jobs.patch((current) => ({
      ...current,
      items: current.items.map((existing) =>
        existing.id === job.id ? job : existing,
      ),
    }));
  }

  /** Starts a poller for every non-terminal job on the current page and stops any whose job is no longer visible or has settled. */
  private syncPolling(): void {
    const visibleActiveIds = new Set(
      this.items()
        .filter((job) => !isTerminal(job.status))
        .map((job) => job.id),
    );

    for (const [id, handle] of this.pollers) {
      if (!visibleActiveIds.has(id)) {
        handle.stop();
        this.pollers.delete(id);
      }
    }

    for (const id of visibleActiveIds) {
      if (this.pollers.has(id)) continue;
      const handle = pollJobUntilTerminal(
        () => this.client.processing.get(id),
        (job) => this.applyJobUpdate(job),
      );
      this.pollers.set(id, handle);
      void handle.done.then(() => this.pollers.delete(id));
    }
  }

  private stopAllPolling(): void {
    for (const handle of this.pollers.values()) handle.stop();
    this.pollers.clear();
  }
}
