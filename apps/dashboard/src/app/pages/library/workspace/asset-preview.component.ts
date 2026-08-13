import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from "@angular/core";
import { VoltButton, VoltNativeSelect } from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnExclamationCircleIcon,
  LmnMagnifyingGlassMinusIcon,
  LmnMagnifyingGlassPlusIcon,
} from "lumen-icons";
import { formatDimensions } from "../../../core/format/format";
import {
  canZoomIn,
  canZoomOut,
  resetZoom,
  setActualSize,
  zoomIn,
  zoomOut,
  zoomPercentLabel,
  type ZoomState,
} from "../../../core/assets/preview-zoom";
import type { PreviewSource } from "../../../core/assets/preview-sources";

export type PreviewBackground = "checkerboard" | "light" | "dark";
export type { PreviewSource };

/**
 * The image preview workspace: fit/actual-size/zoom in/out/reset, a checkerboard/light/dark
 * background so transparency is visible against something meaningful, and honest loading/broken
 * states. Deliberately not an editor — there is no crop or transform gesture here, only viewing.
 *
 * Zoom math lives in `preview-zoom.ts`; this component only turns the resulting `ZoomState` into
 * a CSS transform and owns the loading/error lifecycle of the underlying `<img>`.
 */
@Component({
  selector: "ix-asset-preview",
  standalone: true,
  imports: [
    VoltButton,
    VoltNativeSelect,
    LmnArrowPathIcon,
    LmnExclamationCircleIcon,
    LmnMagnifyingGlassMinusIcon,
    LmnMagnifyingGlassPlusIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div
          class="flex items-center gap-1"
          role="group"
          aria-label="Zoom controls"
        >
          <volt-button
            variant="outline"
            size="icon"
            [disabled]="!canZoomOut()"
            (click)="onZoomOut()"
            data-testid="preview-zoom-out"
          >
            <span class="sr-only">Zoom out</span>
            <lmn-magnifying-glass-minus [size]="16" />
          </volt-button>
          <span
            class="min-w-[4.5rem] text-center text-sm text-muted-foreground"
            data-testid="preview-zoom-label"
          >
            {{ zoomLabel() }}
          </span>
          <volt-button
            variant="outline"
            size="icon"
            [disabled]="!canZoomIn()"
            (click)="onZoomIn()"
            data-testid="preview-zoom-in"
          >
            <span class="sr-only">Zoom in</span>
            <lmn-magnifying-glass-plus [size]="16" />
          </volt-button>
          <volt-button
            variant="outline"
            size="sm"
            (click)="onReset()"
            data-testid="preview-zoom-reset"
          >
            <lmn-arrow-path slot="leading" [size]="14" />
            Reset
          </volt-button>
          <volt-button
            variant="outline"
            size="sm"
            (click)="onActualSize()"
            data-testid="preview-actual-size"
          >
            100%
          </volt-button>
        </div>

        <span class="flex items-center gap-2 text-sm">
          <span class="text-muted-foreground" aria-hidden="true"
            >Background</span
          >
          <select voltNativeSelect
            (change)="background.set($any($event.target).value)"
            aria-label="Preview background"
            data-testid="preview-background"
          >
            <option
              value="checkerboard"
              [selected]="background() === 'checkerboard'"
            >
              Checkerboard
            </option>
            <option value="light" [selected]="background() === 'light'">
              Light
            </option>
            <option value="dark" [selected]="background() === 'dark'">
              Dark
            </option>
          </select>
        </span>
      </div>

      <div
        class="relative flex h-[24rem] items-center justify-center overflow-auto rounded-lg border border-border"
        [class.preview-checkerboard]="background() === 'checkerboard'"
        [class.bg-white]="background() === 'light'"
        [class.bg-neutral-950]="background() === 'dark'"
        data-testid="preview-canvas"
      >
        @if (source(); as src) {
          @if (loadFailed()) {
            <div
              class="flex flex-col items-center gap-2 text-sm text-muted-foreground"
              role="alert"
            >
              <lmn-exclamation-circle [size]="24" tone="destructive" />
              <span>This preview could not be loaded.</span>
            </div>
          } @else {
            @if (!loaded()) {
              <span class="absolute text-sm text-muted-foreground" role="status"
                >Loading preview…</span
              >
            }
            <img
              [src]="src.url"
              [alt]="altText()"
              [style.transform]="'scale(' + effectiveScale() + ')'"
              [style.max-width]="zoom().mode === 'fit' ? '100%' : 'none'"
              [style.max-height]="zoom().mode === 'fit' ? '100%' : 'none'"
              class="select-none transition-opacity"
              [class.opacity-0]="!loaded()"
              (load)="onLoad()"
              (error)="onError()"
            />
          }
        } @else {
          <p class="text-sm text-muted-foreground">No preview available.</p>
        }
      </div>

      <div
        class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
      >
        <span data-testid="preview-dimensions">{{ dimensionsLabel() }}</span>
        <span data-testid="preview-active-label">{{
          source()?.label ?? "—"
        }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      .preview-checkerboard {
        background-image:
          linear-gradient(45deg, #80808022 25%, transparent 25%),
          linear-gradient(-45deg, #80808022 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #80808022 75%),
          linear-gradient(-45deg, transparent 75%, #80808022 75%);
        background-size: 16px 16px;
        background-position:
          0 0,
          0 8px,
          8px -8px,
          -8px 0;
      }
    `,
  ],
})
export class AssetPreview {
  /** `null` while no ready source exists yet (still processing, or the asset only has a placeholder). */
  readonly source = input.required<PreviewSource | null>();
  readonly altText = input<string>("");

  protected readonly zoom = signal<ZoomState>(resetZoom());
  protected readonly background = signal<PreviewBackground>("checkerboard");
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);

  protected readonly canZoomIn = computed(() => canZoomIn(this.zoom()));
  protected readonly canZoomOut = computed(() => canZoomOut(this.zoom()));
  protected readonly zoomLabel = computed(() =>
    zoomPercentLabel(this.zoom(), null),
  );
  protected readonly effectiveScale = computed(() =>
    this.zoom().mode === "fit" ? 1 : this.zoom().scale,
  );

  protected readonly dimensionsLabel = computed(() => {
    const src = this.source();
    return src ? formatDimensions(src.width, src.height) : "—";
  });

  protected onZoomIn(): void {
    this.zoom.update(zoomIn);
  }

  protected onZoomOut(): void {
    this.zoom.update(zoomOut);
  }

  protected onReset(): void {
    this.zoom.set(resetZoom());
  }

  protected onActualSize(): void {
    this.zoom.set(setActualSize());
  }

  protected onLoad(): void {
    this.loaded.set(true);
    this.loadFailed.set(false);
  }

  protected onError(): void {
    this.loadFailed.set(true);
  }
}
