import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { AssetDetails } from "@imageryx/sdk";
import {
  VoltBadge,
  VoltButton,
  VoltDropdownMenu,
  VoltDropdownMenuItem,
  VoltDropdownMenuTrigger,
} from "@voltui/components";
import {
  LmnArrowDownTrayIcon,
  LmnArrowPathIcon,
  LmnChevronLeftIcon,
  LmnChevronDownIcon,
  LmnEyeIcon,
  LmnLockClosedIcon,
  LmnTrashIcon,
} from "lumen-icons";
import { formatDimensions } from "../../../core/format/format";
import { IMAGERYX_CLIENT } from "../../../core/sdk/imageryx-client.token";
import { CopyButton } from "../../../ui/copy-button.component";
import { StatusBadge } from "../../../ui/status-badge.component";

/**
 * The workspace header: identity (name, logical path, project, folder), status badges, quick
 * copy, direct download, and a "more actions" menu.
 *
 * Every menu item does something real today. Rename, move, visibility and tags all live in the
 * Settings tab rather than as separate header dialogs — the menu takes you there instead of
 * duplicating the same form in a second place; it is a real navigation, not a dead end.
 */
@Component({
  selector: "ix-asset-header",
  standalone: true,
  imports: [
    RouterLink,
    VoltBadge,
    VoltButton,
    VoltDropdownMenu,
    VoltDropdownMenuItem,
    VoltDropdownMenuTrigger,
    LmnArrowDownTrayIcon,
    LmnArrowPathIcon,
    LmnChevronLeftIcon,
    LmnChevronDownIcon,
    LmnEyeIcon,
    LmnLockClosedIcon,
    LmnTrashIcon,
    CopyButton,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <a
        routerLink="/library"
        class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <lmn-chevron-left [size]="14" />
        Back to library
      </a>

      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="flex min-w-0 flex-col gap-1">
          <h1 class="truncate text-2xl font-semibold text-foreground">
            {{ asset().name }}
          </h1>
          <p class="truncate font-mono text-sm text-muted-foreground">
            {{ asset().path }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ asset().project?.name ?? "Unknown project" }}
            @if (asset().folder) {
              <span> · {{ asset().folder?.path }}</span>
            } @else {
              <span> · project root</span>
            }
          </p>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <volt-button
            variant="outline"
            size="sm"
            [disabled]="isBusy()"
            (click)="refresh.emit()"
            data-testid="asset-header-refresh"
          >
            <lmn-arrow-path slot="leading" [size]="14" />
            Refresh
          </volt-button>

          @if (deliveryUrl(); as url) {
            <ix-copy-button
              [value]="url"
              label="public delivery URL"
              idleLabel="Copy URL"
            />
          }

          @if (canDownloadOriginal()) {
            <a
              [href]="deliveryUrl()"
              download
              data-testid="asset-header-download"
            >
              <volt-button variant="outline" size="sm">
                <lmn-arrow-down-tray slot="leading" [size]="14" />
                Download
              </volt-button>
            </a>
          }

          <volt-button
            variant="outline"
            size="sm"
            [voltDropdownMenu]="actionsMenu"
            placement="bottom-end"
            data-testid="asset-header-actions"
          >
            More
            <lmn-chevron-down slot="trailing" [size]="14" />
          </volt-button>
          <ng-template #actionsMenu>
            <volt-dropdown-menu class="min-w-[14rem]">
              <volt-dropdown-menu-item (click)="copyPath.emit()">
                Copy logical path
              </volt-dropdown-menu-item>
              <volt-dropdown-menu-item (click)="openSettings.emit()">
                Rename, move or edit tags…
              </volt-dropdown-menu-item>
              @if (asset().deletedAt) {
                <volt-dropdown-menu-item
                  (click)="restore.emit()"
                  data-testid="menu-restore"
                >
                  <lmn-arrow-path slot="leading" [size]="14" />
                  Restore
                </volt-dropdown-menu-item>
              } @else {
                <volt-dropdown-menu-item
                  (click)="delete.emit()"
                  data-testid="menu-delete"
                >
                  <lmn-trash slot="leading" [size]="14" />
                  Delete
                </volt-dropdown-menu-item>
              }
            </volt-dropdown-menu>
          </ng-template>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <ix-status-badge [status]="asset().processingStatus" />
        <volt-badge variant="outline">
          @if (asset().visibility === "public") {
            <lmn-eye slot="leading" [size]="12" />
            <span>Public</span>
          } @else {
            <lmn-lock-closed slot="leading" [size]="12" />
            <span>Private</span>
          }
        </volt-badge>
        <volt-badge variant="outline">{{
          asset().extension.toUpperCase()
        }}</volt-badge>
        <volt-badge variant="outline">{{ dimensionsLabel() }}</volt-badge>
        @if (asset().deletedAt) {
          <volt-badge variant="destructive">Deleted</volt-badge>
        }
      </div>
    </div>
  `,
})
export class AssetHeader {
  readonly asset = input.required<AssetDetails>();
  readonly isBusy = input<boolean>(false);

  readonly refresh = output<void>();
  readonly copyPath = output<void>();
  readonly openSettings = output<void>();
  readonly delete = output<void>();
  readonly restore = output<void>();

  private readonly client = inject(IMAGERYX_CLIENT);

  protected readonly dimensionsLabel = computed(() =>
    formatDimensions(this.asset().width, this.asset().height),
  );

  protected readonly deliveryUrl = computed(() => {
    const asset = this.asset();
    if (
      asset.visibility !== "public" ||
      asset.deletedAt !== null ||
      !asset.project
    )
      return null;
    return this.client.delivery.originalUrl(asset.project.slug, asset.path);
  });

  protected readonly canDownloadOriginal = computed(
    () => this.deliveryUrl() !== null && this.asset().downloadOriginalEnabled,
  );
}
