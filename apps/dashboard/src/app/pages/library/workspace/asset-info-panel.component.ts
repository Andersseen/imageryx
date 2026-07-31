import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { AssetDetails } from "@imageryx/sdk";
import { VoltBadge } from "@voltui/components";
import {
  formatAspectRatio,
  formatBytes,
  formatDateTime,
  formatDimensions,
} from "../../../core/format/format";
import { CopyButton } from "../../../ui/copy-button.component";

/**
 * The asset's metadata, laid out as `<dl>` pairs. Every physical storage key stays out of this
 * view on purpose (see context.md — logical paths and storage keys are deliberately incompatible
 * identifier spaces, and the storage key is provider-facing, never user-facing).
 */
@Component({
  selector: "ix-asset-info-panel",
  standalone: true,
  imports: [VoltBadge, CopyButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl
      class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
      data-testid="asset-info-panel"
    >
      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Original filename</dt>
        <dd class="truncate text-sm" [title]="asset().originalFilename">
          {{ asset().originalFilename }}
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Logical path</dt>
        <dd class="flex items-center gap-2">
          <span class="truncate font-mono text-sm" [title]="asset().path">{{
            asset().path
          }}</span>
          <ix-copy-button
            [value]="asset().path"
            label="logical path"
            idleLabel="Copy"
          />
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">MIME type / extension</dt>
        <dd class="text-sm">
          {{ asset().mimeType }} · .{{ asset().extension }}
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Dimensions / aspect ratio</dt>
        <dd class="text-sm">{{ dimensions() }} · {{ aspectRatio() }}</dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Original size</dt>
        <dd class="text-sm">{{ sizeLabel() }}</dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Alpha channel</dt>
        <dd class="text-sm">{{ alphaLabel() }}</dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Checksum</dt>
        <dd class="flex items-center gap-2">
          <span class="truncate font-mono text-xs" [title]="asset().checksum">
            {{ asset().checksum.slice(0, 16) }}…
          </span>
          <ix-copy-button
            [value]="asset().checksum"
            label="checksum"
            idleLabel="Copy"
          />
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">
          Dominant color / placeholder
        </dt>
        <dd class="flex items-center gap-2 text-sm">
          @if (asset().dominantColor; as color) {
            <span
              class="h-4 w-4 shrink-0 rounded border border-border"
              [style.background]="color"
              aria-hidden="true"
            ></span>
            <span class="font-mono">{{ color }}</span>
          } @else {
            <span>—</span>
          }
          @if (asset().placeholder) {
            <volt-badge variant="outline">Placeholder available</volt-badge>
          }
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">
          Visibility / processing status
        </dt>
        <dd class="text-sm">
          {{ asset().visibility }} · {{ asset().processingStatus }}
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Original-download policy</dt>
        <dd class="text-sm">
          {{
            asset().downloadOriginalEnabled
              ? "Original downloads allowed"
              : "Original downloads disabled"
          }}
        </dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Uploaded</dt>
        <dd class="text-sm">{{ uploadedLabel() }}</dd>
      </div>

      <div class="flex flex-col gap-0.5">
        <dt class="text-xs text-muted-foreground">Last updated</dt>
        <dd class="text-sm">{{ updatedLabel() }}</dd>
      </div>

      @if (asset().deletedAt) {
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted-foreground">Deleted</dt>
          <dd class="text-sm">{{ deletedLabel() }}</dd>
        </div>
      }

      @if (asset().project; as project) {
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted-foreground">Project slug</dt>
          <dd class="flex items-center gap-2">
            <span class="truncate font-mono text-sm">{{ project.slug }}</span>
            <ix-copy-button
              [value]="project.slug"
              label="project slug"
              idleLabel="Copy"
            />
          </dd>
        </div>
      }
    </dl>
  `,
})
export class AssetInfoPanel {
  readonly asset = input.required<AssetDetails>();

  protected readonly dimensions = computed(() =>
    formatDimensions(this.asset().width, this.asset().height),
  );
  protected readonly aspectRatio = computed(() =>
    formatAspectRatio(this.asset().aspectRatio),
  );
  protected readonly sizeLabel = computed(() =>
    formatBytes(this.asset().sizeBytes),
  );
  protected readonly uploadedLabel = computed(() =>
    formatDateTime(this.asset().createdAt),
  );
  protected readonly updatedLabel = computed(() =>
    formatDateTime(this.asset().updatedAt),
  );
  protected readonly deletedLabel = computed(() =>
    formatDateTime(this.asset().deletedAt),
  );

  protected readonly alphaLabel = computed(() => {
    const hasAlpha = this.asset().hasAlpha;
    if (hasAlpha === null) return "Unknown";
    return hasAlpha ? "Yes" : "No";
  });
}
