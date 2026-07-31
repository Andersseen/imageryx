import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import type { AssetListItem, PaginatedResponse } from "@imageryx/sdk";
import {
  VoltButton,
  VoltToggleGroup,
  VoltToggleGroupItem,
} from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnListBulletIcon,
  LmnSquares2x2Icon,
} from "lumen-icons";
import { NotificationService } from "../core/notifications/notification.service";
import { describeApiError } from "../core/api/api-error";
import { AsyncStore } from "../core/api/async-store";
import {
  formatBytes,
  formatDimensions,
  formatRelativeTime,
} from "../core/format/format";
import {
  applyQueryChange,
  clearFilters,
  hasActiveFilters,
  parseAssetQuery,
  toListParams,
  toUrlParams,
  type AssetQuery,
} from "../core/library/asset-query";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { UploadService } from "../core/uploads/upload.service";
import { EmptyState } from "../ui/empty-state.component";
import { ErrorState } from "../ui/error-state.component";
import { LoadingGrid } from "../ui/loading-grid.component";
import { PageHeader } from "../ui/page-header.component";
import { Pager } from "../ui/pager.component";
import { StatusBadge } from "../ui/status-badge.component";
import { AssetCard } from "./library/asset-card.component";
import { LibraryFilters } from "./library/library-filters.component";

type AssetPage = PaginatedResponse<AssetListItem>;

/**
 * The asset library: browse, filter, sort, page, upload into, and soft-delete/restore.
 *
 * The whole view is a function of `(selected project, URL query)`. Filters write to the URL and
 * the URL drives the fetch — never the other way round — so a filtered view is a shareable link,
 * survives reload, and works with the Back button, without a second copy of the state to keep in
 * sync.
 *
 * Opening an individual asset (`/library/:assetId`) is Phase 4B; nothing here links to it, so no
 * control on this page leads somewhere that does not exist yet.
 */
@Component({
  selector: "ix-library-page",
  standalone: true,
  imports: [
    RouterLink,
    VoltButton,
    VoltToggleGroup,
    VoltToggleGroupItem,
    LmnArrowPathIcon,
    LmnListBulletIcon,
    LmnSquares2x2Icon,
    AssetCard,
    LibraryFilters,
    EmptyState,
    ErrorState,
    LoadingGrid,
    PageHeader,
    Pager,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ix-page-header
        title="Library"
        description="Every asset in the selected project, with its processing state and delivery URL."
      >
        <volt-toggle-group
          [value]="viewValue()"
          (valueChange)="onViewChange($event)"
          aria-label="Asset view mode"
        >
          <volt-toggle-group-item value="grid" data-testid="view-grid">
            <lmn-squares-2x2 [size]="14" />
            <span class="sr-only">Grid view</span>
          </volt-toggle-group-item>
          <volt-toggle-group-item value="table" data-testid="view-table">
            <lmn-list-bullet [size]="14" />
            <span class="sr-only">Table view</span>
          </volt-toggle-group-item>
        </volt-toggle-group>

        <volt-button
          variant="outline"
          size="sm"
          [disabled]="assets.isBusy()"
          (click)="refresh()"
          data-testid="library-refresh"
        >
          <lmn-arrow-path slot="leading" [size]="14" />
          Refresh
        </volt-button>
      </ix-page-header>

      @if (!context.selectedProjectId()) {
        @if (context.projectsLoading()) {
          <ix-loading-grid [count]="8" label="Loading projects…" />
        } @else if (context.projectsError(); as error) {
          <ix-error-state [error]="error" (retry)="reloadProjects()" />
        } @else {
          <ix-empty-state
            title="No project selected"
            description="Assets live inside a project. Create one to start uploading images."
          >
            <a routerLink="/projects">
              <volt-button variant="solid" size="sm"
                >Go to Projects</volt-button
              >
            </a>
          </ix-empty-state>
        }
      } @else {
        <ix-library-filters
          [query]="query()"
          [folders]="context.folders()"
          [tags]="context.tags()"
          (queryChange)="updateQuery($event)"
          (clear)="onClearFilters()"
        />

        @if (assets.isLoading()) {
          <ix-loading-grid
            [count]="12"
            [layout]="query().view === 'table' ? 'rows' : 'grid'"
            label="Loading assets…"
          />
        } @else if (assets.error(); as error) {
          <ix-error-state [error]="error" (retry)="refresh()" />
        } @else if (items().length === 0) {
          @if (isFiltered()) {
            <ix-empty-state
              title="No assets match these filters"
              description="Nothing in this project matches the current filter combination."
            >
              <volt-button
                variant="outline"
                size="sm"
                (click)="onClearFilters()"
              >
                Clear filters
              </volt-button>
            </ix-empty-state>
          } @else {
            <ix-empty-state
              title="No assets yet"
              description="Upload your first image with the Upload button in the header."
            />
          }
        } @else {
          <div
            [attr.aria-busy]="assets.isRefreshing() ? 'true' : null"
            [class.opacity-60]="assets.isRefreshing()"
            class="transition-opacity"
          >
            @if (query().view === "grid") {
              <ul
                class="grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4"
                data-testid="asset-grid"
              >
                @for (asset of items(); track asset.id) {
                  <li class="flex">
                    <ix-asset-card
                      class="flex w-full"
                      [asset]="asset"
                      [projectSlug]="projectSlug()"
                      (delete)="deleteAsset($event)"
                      (restore)="restoreAsset($event)"
                    />
                  </li>
                }
              </ul>
            } @else {
              <div class="overflow-x-auto rounded-lg border border-border">
                <table
                  class="w-full min-w-[44rem] border-collapse text-sm"
                  data-testid="asset-table"
                >
                  <caption class="sr-only">
                    Assets in
                    {{
                      context.selectedProject()?.name
                    }}
                  </caption>
                  <thead>
                    <tr class="border-b border-border bg-muted/40 text-left">
                      <th scope="col" class="px-3 py-2 font-medium">Name</th>
                      <th scope="col" class="px-3 py-2 font-medium">Status</th>
                      <th scope="col" class="px-3 py-2 font-medium">
                        Dimensions
                      </th>
                      <th scope="col" class="px-3 py-2 font-medium">Size</th>
                      <th scope="col" class="px-3 py-2 font-medium">
                        Visibility
                      </th>
                      <th scope="col" class="px-3 py-2 font-medium">Updated</th>
                      <th scope="col" class="px-3 py-2 font-medium">
                        <span class="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (asset of items(); track asset.id) {
                      <tr
                        class="border-b border-border last:border-0"
                        data-testid="asset-row"
                      >
                        <td class="px-3 py-2">
                          <span class="flex flex-col">
                            <span class="font-medium">{{ asset.name }}</span>
                            <span
                              class="font-mono text-xs text-muted-foreground"
                            >
                              {{ asset.path }}
                            </span>
                          </span>
                        </td>
                        <td class="px-3 py-2">
                          <ix-status-badge [status]="asset.processingStatus" />
                        </td>
                        <td class="px-3 py-2 text-muted-foreground">
                          {{ dimensionsOf(asset) }}
                        </td>
                        <td class="px-3 py-2 text-muted-foreground">
                          {{ sizeOf(asset) }}
                        </td>
                        <td class="px-3 py-2 text-muted-foreground">
                          {{ asset.visibility }}
                        </td>
                        <td class="px-3 py-2 text-muted-foreground">
                          {{ updatedLabel(asset) }}
                        </td>
                        <td class="px-3 py-2 text-right">
                          @if (asset.deletedAt) {
                            <volt-button
                              variant="outline"
                              size="sm"
                              (click)="restoreAsset(asset)"
                            >
                              Restore
                              <span class="sr-only">{{ asset.name }}</span>
                            </volt-button>
                          } @else {
                            <volt-button
                              variant="ghost"
                              size="sm"
                              (click)="deleteAsset(asset)"
                            >
                              Delete
                              <span class="sr-only">{{ asset.name }}</span>
                            </volt-button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <ix-pager
            [page]="page().page"
            [pageSize]="page().pageSize"
            [total]="page().total"
            itemLabel="assets"
            (pageChange)="updateQuery({ page: $event })"
          />
        }
      }
    </div>
  `,
})
export default class LibraryPage {
  protected readonly context = inject(ProjectContextService);
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly uploads = inject(UploadService);

  /** Keeps the previous page visible while a filter change loads, instead of blanking the grid. */
  protected readonly assets = new AsyncStore<AssetPage>({
    keepDataOnRefreshError: true,
  });

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: null,
  });

  protected readonly query = computed<AssetQuery>(() => {
    const params = this.queryParams();
    if (!params) return parseAssetQuery({});
    const record: Record<string, string | null> = {};
    for (const key of params.keys) record[key] = params.get(key);
    return parseAssetQuery(record);
  });

  protected readonly viewValue = computed(() => [this.query().view]);
  protected readonly page = computed<AssetPage>(
    () =>
      this.assets.data() ?? {
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
  protected readonly projectSlug = computed(
    () => this.context.selectedProject()?.slug ?? "",
  );

  /** Guards against refetching when a navigation produced an identical canonical query. */
  private lastFetchKey: string | null = null;
  private lastSettledAt = 0;

  constructor() {
    void this.context.ensureLoaded();

    effect(() => {
      const projectId = this.context.selectedProjectId();
      const query = this.query();
      if (!projectId) {
        untracked(() => this.assets.reset());
        this.lastFetchKey = null;
        return;
      }

      const key = `${projectId}|${JSON.stringify(toListParams(query))}`;
      if (key === this.lastFetchKey) return;
      this.lastFetchKey = key;
      untracked(() => void this.fetch(projectId, query));
    });

    // An upload reaching a terminal state changes what this list should show. Reacting to a
    // counter means exactly one refetch per settled upload, rather than a background timer.
    effect(() => {
      const settledAt = this.uploads.settledAt();
      if (settledAt === this.lastSettledAt) return;
      this.lastSettledAt = settledAt;
      if (settledAt > 0) untracked(() => void this.refresh());
    });
  }

  private async fetch(projectId: string, query: AssetQuery): Promise<void> {
    await this.assets.load(() =>
      this.client.assets.list(projectId, toListParams(query)),
    );
  }

  protected async refresh(): Promise<void> {
    const projectId = this.context.selectedProjectId();
    if (!projectId) return;
    await this.fetch(projectId, this.query());
  }

  protected async reloadProjects(): Promise<void> {
    await this.context.reloadProjects();
  }

  /**
   * All view-state changes funnel through the URL. `replaceUrl` keeps a single Back step from
   * having to unwind a dozen filter tweaks one at a time.
   */
  protected updateQuery(change: Partial<AssetQuery>): void {
    this.navigateTo(applyQueryChange(this.query(), change));
  }

  protected onClearFilters(): void {
    this.navigateTo(clearFilters(this.query()));
  }

  private navigateTo(next: AssetQuery): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toUrlParams(next),
      replaceUrl: true,
    });
  }

  protected onViewChange(value: readonly string[] | string): void {
    const view = Array.isArray(value) ? value[0] : (value as string);
    if (view === "grid" || view === "table") this.updateQuery({ view });
  }

  protected dimensionsOf(asset: AssetListItem): string {
    return formatDimensions(asset.width, asset.height);
  }

  protected sizeOf(asset: AssetListItem): string {
    return formatBytes(asset.sizeBytes);
  }

  protected updatedLabel(asset: AssetListItem): string {
    return formatRelativeTime(asset.updatedAt);
  }

  /**
   * Soft delete. The confirmation describes what actually happens — the asset stops being served
   * and moves to the deleted list, recoverable — rather than implying the bytes are erased,
   * which is not true (delete writes a `deleted_at` timestamp; storage is untouched).
   */
  protected async deleteAsset(asset: AssetListItem): Promise<void> {
    const confirmed = globalThis.confirm(
      `Delete "${asset.name}"?\n\nIt stops being served at its delivery URL and moves to the deleted list, where it can be restored. The stored file is not erased.`,
    );
    if (!confirmed) return;

    try {
      await this.client.assets.delete(asset.id);
      this.toasts.success("Asset deleted", `"${asset.name}" moved to deleted.`);
      await this.refresh();
    } catch (error) {
      const info = describeApiError(error);
      this.toasts.error(info.title, info.detail);
    }
  }

  protected async restoreAsset(asset: AssetListItem): Promise<void> {
    try {
      await this.client.assets.restore(asset.id);
      this.toasts.success("Asset restored", `"${asset.name}" restored.`);
      await this.refresh();
    } catch (error) {
      // Restore genuinely can fail: another active asset may now occupy the same logical path.
      // The API's conflict message names that path, so surfacing it verbatim is the useful thing.
      const info = describeApiError(error);
      this.toasts.error(info.title, info.detail);
    }
  }
}
