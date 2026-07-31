import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from "@angular/core";
import type { AssetDetails, ImageVariant } from "@imageryx/sdk";
import { VoltBadge, VoltSlider } from "@voltui/components";
import { formatBytes, formatDimensions } from "../../../core/format/format";
import { summarizeComparison } from "../../../core/assets/comparison";

/**
 * A lightweight before/after: the original next to the selected ready variant, with real size,
 * dimension and format numbers. When the transformation is the mock provider's, that is stated
 * plainly rather than implied by the picture — the two images are not claimed to demonstrate
 * real compression quality (see context.md, "Variant generation: real SVG bytes").
 *
 * The slider is a real `<input type="range">` (via Volt's `VoltSlider`, itself a native
 * `role="slider"` element) rather than a custom drag handle, so it is keyboard-operable for free
 * — arrow keys move it, Tab reaches it, a screen reader announces it as a slider with a value.
 */
@Component({
  selector: "ix-asset-comparison",
  standalone: true,
  imports: [VoltBadge, VoltSlider],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-testid="asset-comparison"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">
          Before / after — {{ presetName() }}
        </h3>
        @if (summary().isSimulated) {
          <volt-badge variant="outline"
            >Simulated — not a real compression comparison</volt-badge
          >
        }
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <figure class="flex flex-col gap-2">
          <figcaption class="text-xs font-medium text-muted-foreground">
            Original
          </figcaption>
          @if (originalUrl(); as url) {
            <img
              [src]="url"
              alt=""
              class="max-h-64 w-full rounded-md border border-border object-contain"
            />
          }
          <dl class="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
            <dt>Size</dt>
            <dd>{{ originalSizeLabel() }}</dd>
            <dt>Dimensions</dt>
            <dd>{{ originalDimensionsLabel() }}</dd>
          </dl>
        </figure>

        <figure class="flex flex-col gap-2">
          <figcaption class="text-xs font-medium text-muted-foreground">
            {{ presetName() }}
          </figcaption>
          @if (variantUrl(); as url) {
            <img
              [src]="url"
              alt=""
              class="max-h-64 w-full rounded-md border border-border object-contain"
            />
          }
          <dl class="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
            <dt>Size</dt>
            <dd>{{ variantSizeLabel() }}</dd>
            <dt>Dimensions</dt>
            <dd>{{ variantDimensionsLabel() }}</dd>
            <dt>Format</dt>
            <dd>{{ summary().variantFormat ?? "—" }}</dd>
          </dl>
        </figure>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-muted-foreground">Blend</span>
        <volt-slider
          [value]="blend()"
          (valueChange)="blend.set($event)"
          [min]="0"
          [max]="100"
          [ariaLabel]="'Comparison blend between original and ' + presetName()"
          class="flex-1"
          data-testid="comparison-slider"
        />
      </div>

      <p class="text-sm font-medium" [class.text-destructive]="isLarger()">
        {{ savedLabel() }}
      </p>
    </div>
  `,
})
export class AssetComparison {
  readonly asset = input.required<AssetDetails>();
  readonly variant = input.required<ImageVariant>();
  readonly presetName = input<string>("Variant");
  readonly originalUrl = input<string | null>(null);
  readonly variantUrl = input<string | null>(null);

  protected readonly summary = computed(() =>
    summarizeComparison(this.asset(), this.variant()),
  );

  /** Purely presentational — the slider does not swap image crops, only labels which side is emphasized. */
  protected readonly blend = signal(50);

  protected readonly originalSizeLabel = computed(() =>
    formatBytes(this.summary().originalSizeBytes),
  );
  protected readonly variantSizeLabel = computed(() =>
    formatBytes(this.summary().variantSizeBytes),
  );
  protected readonly originalDimensionsLabel = computed(() =>
    formatDimensions(
      this.summary().originalDimensions.width,
      this.summary().originalDimensions.height,
    ),
  );
  protected readonly variantDimensionsLabel = computed(() =>
    formatDimensions(
      this.summary().variantDimensions.width,
      this.summary().variantDimensions.height,
    ),
  );

  protected readonly isLarger = computed(
    () => (this.summary().percentSaved ?? 0) < 0,
  );

  protected readonly savedLabel = computed(() => {
    const percent = this.summary().percentSaved;
    if (percent === null) return "Size comparison not available yet.";
    if (percent >= 0) return `${percent}% smaller than the original`;
    return `${Math.abs(percent)}% larger than the original`;
  });
}
