import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import type { AssetListItem } from "@imageryx/sdk";
import { VoltBadge, VoltButton } from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnEyeIcon,
  LmnLockClosedIcon,
  LmnTrashIcon,
} from "lumen-icons";
import { formatBytes, formatDimensions } from "../../core/format/format";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { AssetThumbnail } from "../../ui/asset-thumbnail.component";
import { CopyButton } from "../../ui/copy-button.component";
import { StatusBadge } from "../../ui/status-badge.component";

/**
 * One asset in the library grid.
 *
 * The card is an `<article>` with a real heading rather than a link: the full asset workspace
 * (`/library/:assetId`) is Phase 4B, and a card that navigates nowhere would be exactly the
 * "unfinished functional-looking control" this project avoids. Every control shown here does
 * something real today.
 */
@Component({
  selector: "ix-asset-card",
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    AssetThumbnail,
    CopyButton,
    StatusBadge,
    LmnArrowPathIcon,
    LmnEyeIcon,
    LmnLockClosedIcon,
    LmnTrashIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      data-testid="asset-card"
    >
      <div class="aspect-[4/3] w-full">
        <ix-asset-thumbnail [asset]="asset()" [projectSlug]="projectSlug()" />
      </div>

      <div class="flex min-w-0 flex-col gap-1">
        <h3
          class="truncate text-sm font-medium text-foreground"
          [title]="asset().name"
        >
          {{ asset().name }}
        </h3>
        <p
          class="truncate font-mono text-xs text-muted-foreground"
          [title]="asset().path"
        >
          {{ asset().path }}
        </p>
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
        @if (asset().readyVariantCount > 0) {
          <volt-badge variant="outline"
            >{{ asset().readyVariantCount }} variants</volt-badge
          >
        }
      </div>

      <dl
        class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        <div class="flex flex-col">
          <dt class="sr-only">Dimensions</dt>
          <dd>{{ dimensions() }}</dd>
        </div>
        <div class="flex flex-col text-right">
          <dt class="sr-only">File size</dt>
          <dd>{{ size() }}</dd>
        </div>
      </dl>

      @if (asset().tags.length > 0) {
        <ul class="flex flex-wrap gap-1">
          @for (tag of asset().tags; track tag) {
            <li>
              <volt-badge variant="secondary">{{ tag }}</volt-badge>
            </li>
          }
        </ul>
      }

      <div
        class="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
      >
        @if (deliveryUrl(); as url) {
          <ix-copy-button
            [value]="url"
            label="public delivery URL"
            idleLabel="Copy URL"
          />
        } @else {
          <ix-copy-button
            [value]="asset().path"
            label="logical asset path"
            idleLabel="Copy path"
          />
        }

        @if (asset().deletedAt) {
          <volt-button
            variant="outline"
            size="sm"
            (click)="restore.emit(asset())"
            data-testid="asset-restore"
          >
            <lmn-arrow-path slot="leading" [size]="14" />
            Restore
          </volt-button>
        } @else {
          <volt-button
            variant="ghost"
            size="sm"
            (click)="delete.emit(asset())"
            data-testid="asset-delete"
          >
            <lmn-trash slot="leading" [size]="14" />
            <span class="sr-only">Delete {{ asset().name }}</span>
            <span aria-hidden="true">Delete</span>
          </volt-button>
        }
      </div>
    </article>
  `,
})
export class AssetCard {
  readonly asset = input.required<AssetListItem>();
  readonly projectSlug = input.required<string>();

  readonly delete = output<AssetListItem>();
  readonly restore = output<AssetListItem>();

  private readonly client = inject(IMAGERYX_CLIENT);

  protected readonly dimensions = computed(() =>
    formatDimensions(this.asset().width, this.asset().height),
  );
  protected readonly size = computed(() => formatBytes(this.asset().sizeBytes));

  /**
   * Only offered for an asset the URL actually resolves for. A private or deleted asset's
   * delivery route returns 404 by design, so copying that URL would hand the user a dead link.
   */
  protected readonly deliveryUrl = computed(() => {
    const asset = this.asset();
    if (asset.visibility !== "public" || asset.deletedAt !== null) return null;
    return this.client.delivery.originalUrl(this.projectSlug(), asset.path);
  });
}
