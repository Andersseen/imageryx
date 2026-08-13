import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AssetDetails } from "@imageryx/sdk";
import { VoltBadge, VoltButton, VoltNativeSelect } from "@voltui/components";
import { LmnArrowDownTrayIcon, LmnLinkIcon } from "lumen-icons";
import type { ApiErrorInfo } from "../../../core/api/api-error";
import { type AssetWorkspaceService } from "../../../core/assets/asset-workspace.service";
import {
  buildDownloadOptions,
  type DownloadOption,
} from "../../../core/assets/download-options";
import { toVariantViews } from "../../../core/assets/variant-view";
import {
  formatBytes,
  formatDateTime,
  formatDimensions,
} from "../../../core/format/format";
import { IMAGERYX_CLIENT } from "../../../core/sdk/imageryx-client.token";
import { CopyButton } from "../../../ui/copy-button.component";

interface SignedLinkState {
  status: "creating" | "ready" | "failed";
  url: string | null;
  expiresAt: string | null;
  error: ApiErrorInfo | null;
}

const EXPIRY_OPTIONS = [
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 86_400, label: "24 hours" },
] as const;

/**
 * Real, available download options — the original (when downloads are allowed) plus every
 * `ready` variant, `download-high` highlighted. A signed link is created only when the user
 * clicks "Create link" for a specific option, never speculatively on render (see context.md,
 * "Signed downloads" — issuing one is a real, logged, rate-limit-relevant API call).
 */
@Component({
  selector: "ix-asset-download",
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    VoltNativeSelect,
    LmnArrowDownTrayIcon,
    LmnLinkIcon,
    CopyButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col gap-3" data-testid="download-options">
      @for (option of options(); track option.variantParam) {
        <li
          class="flex flex-col gap-2 rounded-lg border border-border p-3"
          [class.opacity-60]="!option.available"
          data-testid="download-option"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ option.label }}</span>
              @if (option.highlighted) {
                <volt-badge variant="secondary">High quality</volt-badge>
              }
            </div>
            <span class="text-xs text-muted-foreground">
              {{ formatDims(option) }} · {{ formatSize(option) }} ·
              {{ option.format ?? "—" }}
            </span>
          </div>

          @if (!option.available) {
            <p class="text-sm text-muted-foreground">
              {{ option.unavailableReason }}
            </p>
          } @else {
            <div class="flex flex-wrap items-center gap-2">
              <select voltNativeSelect
                class="w-40"
                [attr.aria-label]="'Link expiration for ' + option.label"
                (change)="
                  setExpiry(option.variantParam, $any($event.target).value)
                "
              >
                @for (choice of expiryOptions; track choice.value) {
                  <option [value]="choice.value">{{ choice.label }}</option>
                }
              </select>
              <volt-button
                variant="outline"
                size="sm"
                [disabled]="
                  linkState(option.variantParam)?.status === 'creating'
                "
                (click)="createLink(option.variantParam)"
                data-testid="download-create-link"
              >
                <lmn-link slot="leading" [size]="14" />
                {{
                  linkState(option.variantParam)?.status === "creating"
                    ? "Creating…"
                    : "Create link"
                }}
              </volt-button>
            </div>

            @if (linkState(option.variantParam); as state) {
              @if (state.status === "ready" && state.url) {
                <div
                  class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  <a
                    [href]="state.url"
                    target="_blank"
                    rel="noreferrer"
                    class="flex items-center gap-1 text-primary"
                  >
                    <lmn-arrow-down-tray [size]="12" />
                    Open
                  </a>
                  <ix-copy-button
                    [value]="state.url"
                    label="signed download URL"
                    idleLabel="Copy link"
                  />
                  <span>Expires {{ formatExpiry(state.expiresAt) }}</span>
                </div>
              } @else if (state.status === "failed") {
                <p class="text-sm text-destructive">
                  {{ state.error?.detail }}
                </p>
              }
            }
          }
        </li>
      }
    </ul>
  `,
})
export class AssetDownload {
  readonly asset = input.required<AssetDetails>();
  readonly workspace = input.required<AssetWorkspaceService>();

  private readonly client = inject(IMAGERYX_CLIENT);

  protected readonly expiryOptions = EXPIRY_OPTIONS;
  private readonly expiryByOption = signal<Record<string, number>>({});
  private readonly linksByOption = signal<Record<string, SignedLinkState>>({});

  protected readonly options = computed<DownloadOption[]>(() => {
    const asset = this.asset();
    const views = toVariantViews(
      asset.variants,
      asset.presets,
      (project, path, preset) =>
        this.client.delivery.presetUrl(project, path, preset),
      asset.project?.slug ?? "",
      asset.path,
    );
    return buildDownloadOptions(asset, views);
  });

  protected linkState(variantParam: string): SignedLinkState | undefined {
    return this.linksByOption()[variantParam];
  }

  protected setExpiry(variantParam: string, value: string): void {
    this.expiryByOption.update((current) => ({
      ...current,
      [variantParam]: Number(value),
    }));
  }

  protected async createLink(variantParam: string): Promise<void> {
    const expiresIn = this.expiryByOption()[variantParam] ?? 900;
    this.linksByOption.update((current) => ({
      ...current,
      [variantParam]: {
        status: "creating",
        url: null,
        expiresAt: null,
        error: null,
      },
    }));

    const result = await this.workspace().createDownloadUrl(
      variantParam,
      expiresIn,
    );
    this.linksByOption.update((current) => ({
      ...current,
      [variantParam]: result.ok
        ? {
            status: "ready",
            url: result.url,
            expiresAt: result.expiresAt,
            error: null,
          }
        : { status: "failed", url: null, expiresAt: null, error: result.error },
    }));
  }

  protected formatDims(option: DownloadOption): string {
    return formatDimensions(option.dimensions.width, option.dimensions.height);
  }

  protected formatSize(option: DownloadOption): string {
    return formatBytes(option.sizeBytes);
  }

  protected formatExpiry(iso: string | null): string {
    return iso ? formatDateTime(iso) : "—";
  }
}
