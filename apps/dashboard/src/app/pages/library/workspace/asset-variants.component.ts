import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type {
  AssetDetails,
  ImageVariant,
  PreviewPresetResponse,
} from "@imageryx/sdk";
import {
  VoltBadge,
  VoltButton,
  VoltNativeSelect,
  VoltSwitch,
} from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnCheckCircleIcon,
  LmnExclamationCircleIcon,
  LmnEyeIcon,
} from "lumen-icons";
import { describeApiError } from "../../../core/api/api-error";
import { type AssetWorkspaceService } from "../../../core/assets/asset-workspace.service";
import { findJobForVariant } from "../../../core/assets/variant-job-link";
import {
  toVariantViews,
  type VariantView,
} from "../../../core/assets/variant-view";
import { formatBytes, formatDimensions } from "../../../core/format/format";
import { IMAGERYX_CLIENT } from "../../../core/sdk/imageryx-client.token";
import { EmptyState } from "../../../ui/empty-state.component";
import { CopyButton } from "../../../ui/copy-button.component";
import { StatusBadge } from "../../../ui/status-badge.component";
import { AssetComparison } from "./asset-comparison.component";

/**
 * Lists every existing variant and provides the one generation panel for creating a new one.
 *
 * The panel calls the real preset-preview endpoint on selection, so "expected dimensions",
 * output format and the simulated-mode warning are the API's own answer for *this* asset's real
 * size — never a guess computed client-side from the preset's operations.
 */
@Component({
  selector: "ix-asset-variants",
  standalone: true,
  imports: [
    RouterLink,
    VoltBadge,
    VoltButton,
    VoltNativeSelect,
    VoltSwitch,
    LmnArrowPathIcon,
    LmnCheckCircleIcon,
    LmnExclamationCircleIcon,
    LmnEyeIcon,
    CopyButton,
    EmptyState,
    StatusBadge,
    AssetComparison,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <section
        class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h2 class="text-sm font-semibold">Generate a variant</h2>

        <div class="flex flex-wrap items-end gap-3">
          <span class="flex flex-col gap-1.5 text-sm">
            <span class="text-muted-foreground" aria-hidden="true">Preset</span>
            <volt-native-select
              class="min-w-[12rem]"
              (change)="onPresetChange($any($event.target).value)"
              aria-label="Preset to generate a variant from"
              data-testid="variant-preset-select"
            >
              <option value="" [selected]="!selectedPresetId()">
                Select a preset…
              </option>
              @for (preset of asset().presets; track preset.id) {
                <option
                  [value]="preset.id"
                  [selected]="preset.id === selectedPresetId()"
                >
                  {{ preset.name }}
                </option>
              }
            </volt-native-select>
          </span>

          <span class="flex items-center gap-2 text-sm">
            <volt-switch
              [checked]="persist()"
              (checkedChange)="persist.set($event)"
              aria-label="Persist output to storage"
            />
            <span class="text-muted-foreground" aria-hidden="true"
              >Persist output</span
            >
          </span>

          <volt-button
            variant="solid"
            size="sm"
            [disabled]="!canGenerate()"
            (click)="generate()"
            data-testid="variant-generate-submit"
          >
            {{ generateLabel() }}
          </volt-button>
        </div>

        @if (previewState() === "loading") {
          <p class="text-sm text-muted-foreground" role="status">
            Loading expected output…
          </p>
        } @else if (previewError(); as error) {
          <p class="text-sm text-destructive">{{ error }}</p>
        } @else if (preview(); as p) {
          <div
            class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
          >
            <span>Expected: {{ formatDims(p.width, p.height) }}</span>
            <span>Format: {{ p.outputFormat }}</span>
            <span>~{{ formatSize(p.sizeBytes) }}</span>
            @if (p.simulated) {
              <volt-badge variant="outline"
                >Simulated transformation</volt-badge
              >
            }
          </div>
        }

        @if (existingVariantNote(); as note) {
          <p class="text-sm text-muted-foreground">{{ note }}</p>
        }
      </section>

      @if (variantViews().length === 0) {
        <ix-empty-state
          title="No variants yet"
          description="Generate one above using any preset from this project."
        />
      } @else {
        <ul class="flex flex-col gap-3" data-testid="variant-list">
          @for (view of variantViews(); track view.variant.id) {
            <li
              class="flex flex-col gap-2 rounded-lg border border-border p-3"
              data-testid="variant-row"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-sm font-medium">{{
                    view.presetName
                  }}</span>
                  <span class="font-mono text-xs text-muted-foreground">
                    {{ view.presetHashAbbreviation }} ·
                    {{ view.variant.provider }}
                  </span>
                </div>
                <ix-status-badge [status]="statusForBadge(view)" />
              </div>

              <div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{{ dims(view) }}</span>
                <span>{{ view.variant.mimeType ?? "—" }}</span>
                <span>{{ size(view) }}</span>
                @if (view.isSimulated) {
                  <volt-badge variant="outline">Simulated</volt-badge>
                }
                @if (!view.isPersisted && view.variant.status === "ready") {
                  <volt-badge variant="outline">Dynamic delivery</volt-badge>
                }
              </div>

              <div class="flex flex-wrap items-center gap-2">
                @if (view.deliveryUrl; as url) {
                  <a [href]="url" target="_blank" rel="noreferrer">
                    <volt-button variant="ghost" size="sm">
                      <lmn-eye slot="leading" [size]="14" />
                      Preview
                    </volt-button>
                  </a>
                  <ix-copy-button
                    [value]="url"
                    label="variant delivery URL"
                    idleLabel="Copy URL"
                  />
                  <a [href]="url" download>
                    <volt-button variant="ghost" size="sm"
                      >Download</volt-button
                    >
                  </a>
                }
                @if (
                  view.variant.status === "failed" && jobIdFor(view.variant);
                  as jobId
                ) {
                  <volt-button
                    variant="outline"
                    size="sm"
                    [disabled]="
                      workspace().isRequestActive(view.variant.presetId)
                    "
                    (click)="retry(view.variant.presetId, jobId)"
                    data-testid="variant-retry"
                  >
                    <lmn-arrow-path slot="leading" [size]="14" />
                    Retry
                  </volt-button>
                }
                @if (jobIdFor(view.variant); as jobId) {
                  <a [routerLink]="['/processing', jobId]">
                    <volt-button variant="ghost" size="sm"
                      >Open job</volt-button
                    >
                  </a>
                }
                @if (view.variant.status === "ready") {
                  <volt-button
                    variant="ghost"
                    size="sm"
                    (click)="toggleCompare(view.variant.id)"
                    data-testid="variant-compare"
                  >
                    {{
                      comparingVariantId() === view.variant.id
                        ? "Hide comparison"
                        : "Compare"
                    }}
                  </volt-button>
                }
              </div>

              @if (comparingVariantId() === view.variant.id) {
                <ix-asset-comparison
                  [asset]="asset()"
                  [variant]="view.variant"
                  [presetName]="view.presetName"
                  [originalUrl]="originalPreviewUrl()"
                  [variantUrl]="view.deliveryUrl"
                />
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AssetVariants {
  readonly asset = input.required<AssetDetails>();
  readonly workspace = input.required<AssetWorkspaceService>();
  /** The original's public delivery URL, if any — passed down so the comparison panel never has to rebuild it. */
  readonly originalPreviewUrl = input<string | null>(null);

  private readonly client = inject(IMAGERYX_CLIENT);

  protected readonly selectedPresetId = signal<string | null>(null);
  protected readonly persist = signal(true);
  protected readonly preview = signal<PreviewPresetResponse | null>(null);
  protected readonly previewState = signal<"idle" | "loading" | "done">("idle");
  protected readonly previewError = signal<string | null>(null);
  protected readonly comparingVariantId = signal<string | null>(null);

  protected readonly variantViews = computed<VariantView[]>(() => {
    const asset = this.asset();
    const projectSlug = asset.project?.slug ?? "";
    return toVariantViews(
      asset.variants,
      asset.presets,
      (project, path, preset) =>
        this.client.delivery.presetUrl(project, path, preset),
      projectSlug,
      asset.path,
    );
  });

  protected readonly existingVariantNote = computed(() => {
    const presetId = this.selectedPresetId();
    if (!presetId) return null;
    const existing = this.asset().variants.find((v) => v.presetId === presetId);
    if (!existing) return null;
    if (existing.status === "ready")
      return "This preset already has a ready variant — generating again will reuse it.";
    if (existing.status === "pending" || existing.status === "processing")
      return "This preset already has a variant in progress.";
    return null;
  });

  protected readonly canGenerate = computed(() => {
    const presetId = this.selectedPresetId();
    if (!presetId) return false;
    return !this.workspace().isRequestActive(presetId);
  });

  protected readonly generateLabel = computed(() => {
    const presetId = this.selectedPresetId();
    if (presetId && this.workspace().isRequestActive(presetId))
      return "Generating…";
    return "Generate variant";
  });

  protected async onPresetChange(presetId: string): Promise<void> {
    this.selectedPresetId.set(presetId || null);
    this.preview.set(null);
    this.previewError.set(null);
    if (!presetId) {
      this.previewState.set("idle");
      return;
    }

    this.previewState.set("loading");
    try {
      const asset = this.asset();
      const result = await this.client.presets.preview(presetId, {
        sourceWidth: asset.width ?? undefined,
        sourceHeight: asset.height ?? undefined,
      });
      this.preview.set(result);
      this.previewState.set("done");
    } catch (error) {
      this.previewError.set(describeApiError(error).detail);
      this.previewState.set("done");
    }
  }

  protected async generate(): Promise<void> {
    const presetId = this.selectedPresetId();
    if (!presetId) return;
    await this.workspace().generateVariant(presetId, this.persist());
  }

  protected async retry(presetId: string, jobId: string): Promise<void> {
    await this.workspace().retryJob(presetId, jobId);
  }

  protected toggleCompare(variantId: string): void {
    this.comparingVariantId.update((current) =>
      current === variantId ? null : variantId,
    );
  }

  protected jobIdFor(variant: ImageVariant): string | null {
    if (
      variant.status !== "pending" &&
      variant.status !== "processing" &&
      variant.status !== "failed"
    ) {
      return null;
    }
    return findJobForVariant(variant, this.asset().processingJobs)?.id ?? null;
  }

  protected statusForBadge(
    view: VariantView,
  ): "pending" | "processing" | "ready" | "failed" {
    return view.variant.status;
  }

  protected dims(view: VariantView): string {
    return formatDimensions(view.variant.width, view.variant.height);
  }

  protected size(view: VariantView): string {
    return formatBytes(view.variant.sizeBytes);
  }

  protected formatDims(width: number | null, height: number | null): string {
    return formatDimensions(width, height);
  }

  protected formatSize(sizeBytes: number): string {
    return formatBytes(sizeBytes);
  }
}
