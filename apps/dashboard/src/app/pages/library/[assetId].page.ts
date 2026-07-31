import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import {
  VoltTabs,
  VoltTabsContent,
  VoltTabsList,
  VoltTabsTrigger,
} from "@voltui/components";
import { AssetWorkspaceService } from "../../core/assets/asset-workspace.service";
import { buildPreviewSources } from "../../core/assets/preview-sources";
import { toVariantViews } from "../../core/assets/variant-view";
import { NotificationService } from "../../core/notifications/notification.service";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { EmptyState } from "../../ui/empty-state.component";
import { ErrorState } from "../../ui/error-state.component";
import { LoadingGrid } from "../../ui/loading-grid.component";
import { AssetActivity } from "./workspace/asset-activity.component";
import { AssetDelivery } from "./workspace/asset-delivery.component";
import { AssetDownload } from "./workspace/asset-download.component";
import { AssetHeader } from "./workspace/asset-header.component";
import { AssetInfoPanel } from "./workspace/asset-info-panel.component";
import { AssetPreview } from "./workspace/asset-preview.component";
import { AssetSettings } from "./workspace/asset-settings.component";
import { AssetVariants } from "./workspace/asset-variants.component";

const TABS = [
  "preview",
  "info",
  "variants",
  "delivery",
  "download",
  "activity",
  "settings",
] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "preview";

/**
 * The asset workspace: `/library/:assetId`.
 *
 * `AssetWorkspaceService` is provided *on this component*, not in root — a fresh instance loads
 * for every asset visited and is torn down (with any in-flight poll) the moment the route
 * changes, so navigating from one asset to the next can never show a flash of the previous
 * asset's data or leave a stray timer running against it.
 *
 * The active tab lives in the URL (`?tab=`), the same "URL is the state" model the library list
 * uses — a link to a specific tab is shareable and survives reload.
 */
@Component({
  selector: "ix-asset-workspace-page",
  standalone: true,
  imports: [
    VoltTabs,
    VoltTabsContent,
    VoltTabsList,
    VoltTabsTrigger,
    EmptyState,
    ErrorState,
    LoadingGrid,
    AssetActivity,
    AssetDelivery,
    AssetDownload,
    AssetHeader,
    AssetInfoPanel,
    AssetPreview,
    AssetSettings,
    AssetVariants,
  ],
  providers: [AssetWorkspaceService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (workspace.details.isLoading()) {
      <ix-loading-grid [count]="1" layout="rows" label="Loading asset…" />
    } @else if (workspace.details.error(); as error) {
      <ix-error-state [error]="error" (retry)="reload()" />
    } @else if (workspace.asset(); as asset) {
      <div class="flex flex-col gap-6">
        <ix-asset-header
          [asset]="asset"
          [isBusy]="workspace.details.isRefreshing()"
          (refresh)="reload()"
          (copyPath)="copyPath(asset.path)"
          (openSettings)="setTab('settings')"
          (delete)="deleteAsset(asset.name)"
          (restore)="restoreAsset(asset.name)"
        />

        @if (asset.deletedAt) {
          <ix-empty-state
            title="This asset is deleted"
            description="It no longer resolves at its delivery URL. Restore it from the menu above to bring it back."
          />
        }

        <volt-tabs [value]="activeTab()" (valueChange)="onTabChange($event)">
          <volt-tabs-list aria-label="Asset workspace sections">
            <volt-tabs-trigger value="preview">Preview</volt-tabs-trigger>
            <volt-tabs-trigger value="info">Info</volt-tabs-trigger>
            <volt-tabs-trigger value="variants">Variants</volt-tabs-trigger>
            <volt-tabs-trigger value="delivery">Delivery</volt-tabs-trigger>
            <volt-tabs-trigger value="download">Download</volt-tabs-trigger>
            <volt-tabs-trigger value="activity">Activity</volt-tabs-trigger>
            <volt-tabs-trigger value="settings">Settings</volt-tabs-trigger>
          </volt-tabs-list>

          <volt-tabs-content value="preview">
            <ix-asset-preview
              [source]="selectedPreviewSource()"
              [altText]="asset.name"
            />
          </volt-tabs-content>

          <volt-tabs-content value="info">
            <ix-asset-info-panel [asset]="asset" />
          </volt-tabs-content>

          <volt-tabs-content value="variants">
            <ix-asset-variants
              [asset]="asset"
              [workspace]="workspace"
              [originalPreviewUrl]="originalUrl()"
            />
          </volt-tabs-content>

          <volt-tabs-content value="delivery">
            <ix-asset-delivery [asset]="asset" />
          </volt-tabs-content>

          <volt-tabs-content value="download">
            <ix-asset-download [asset]="asset" [workspace]="workspace" />
          </volt-tabs-content>

          <volt-tabs-content value="activity">
            <ix-asset-activity [asset]="asset" />
          </volt-tabs-content>

          <volt-tabs-content value="settings">
            <ix-asset-settings
              [asset]="asset"
              [workspace]="workspace"
              [folders]="context.folders()"
            />
          </volt-tabs-content>
        </volt-tabs>
      </div>
    }
  `,
})
export default class AssetWorkspacePage {
  protected readonly workspace = inject(AssetWorkspaceService);
  protected readonly context = inject(ProjectContextService);
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: null,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: null,
  });

  protected readonly activeTab = computed<Tab>(() => {
    const raw = this.queryParams()?.get("tab");
    return (TABS as readonly string[]).includes(raw ?? "")
      ? (raw as Tab)
      : DEFAULT_TAB;
  });

  protected readonly originalUrl = computed(() => {
    const asset = this.workspace.asset();
    if (!asset || asset.visibility !== "public" || !asset.project) return null;
    return this.client.delivery.originalUrl(asset.project.slug, asset.path);
  });

  private readonly variantViews = computed(() => {
    const asset = this.workspace.asset();
    if (!asset) return [];
    return toVariantViews(
      asset.variants,
      asset.presets,
      (project, path, preset) =>
        this.client.delivery.presetUrl(project, path, preset),
      asset.project?.slug ?? "",
      asset.path,
    );
  });

  protected readonly previewSources = computed(() => {
    const asset = this.workspace.asset();
    if (!asset) return [];
    return buildPreviewSources(
      this.originalUrl(),
      asset.width,
      asset.height,
      this.variantViews().map((view) => ({ view, variant: view.variant })),
    );
  });

  /** The original when it resolves, otherwise the first ready variant — never a guess at a URL that might 404. */
  protected readonly selectedPreviewSource = computed(
    () => this.previewSources()[0]?.source ?? null,
  );

  constructor() {
    void this.context.ensureLoaded();

    let loadedAssetId: string | null = null;
    effect(() => {
      const id = this.params()?.get("assetId");
      if (!id || id === loadedAssetId) return;
      loadedAssetId = id;
      untracked(() => void this.workspace.load(id));
    });

    // A deep link can land on an asset belonging to a project other than whichever one is
    // currently selected (or remembered from a previous session) — this keeps the Settings tab's
    // folder list, and the rest of the shared project context, pointed at the asset's own
    // project instead of a stale one. Depends on `context.projects()` too (not just the asset),
    // so it retries once the project list finishes loading if the asset happened to load first.
    effect(() => {
      const asset = this.workspace.asset();
      const projectsLoaded = this.context.projects().length > 0;
      if (!asset || !projectsLoaded) return;
      untracked(() => {
        if (this.context.selectedProjectId() !== asset.projectId) {
          this.context.select(asset.projectId);
        }
      });
    });
  }

  protected async reload(): Promise<void> {
    await this.workspace.refresh();
  }

  protected setTab(tab: Tab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  protected onTabChange(value: string | undefined): void {
    if (value) this.setTab(value as Tab);
  }

  protected async copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
      this.notifications.success(
        "Copied",
        "Logical path copied to the clipboard.",
      );
    } catch {
      this.notifications.error("Could not copy", "Copy the path manually.");
    }
  }

  protected async deleteAsset(name: string): Promise<void> {
    const confirmed = globalThis.confirm(
      `Delete "${name}"?\n\nIt stops being served at its delivery URL and moves to the deleted list, where it can be restored. The stored file is not erased.`,
    );
    if (!confirmed) return;

    const result = await this.workspace.softDelete();
    if (result.ok) {
      this.notifications.success(
        "Asset deleted",
        `"${name}" moved to deleted.`,
      );
      void this.router.navigate(["/library"]);
    } else {
      this.notifications.error(result.error.title, result.error.detail);
    }
  }

  protected async restoreAsset(name: string): Promise<void> {
    const result = await this.workspace.restore();
    if (result.ok) {
      this.notifications.success("Asset restored", `"${name}" restored.`);
    } else {
      this.notifications.error(result.error.title, result.error.detail);
    }
  }
}
