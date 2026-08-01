import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { ImagePreset, PreviewPresetResponse } from "@imageryx/sdk";
import {
  VoltBadge,
  VoltButton,
  VoltInput,
  VoltNativeSelect,
  VoltSwitch,
  VoltTextarea,
} from "@voltui/components";
import { LmnCheckCircleIcon, LmnExclamationCircleIcon } from "lumen-icons";
import {
  conflictCode,
  conflictDetails,
  describeApiError,
  type ApiErrorInfo,
} from "../../core/api/api-error";
import { AsyncStore } from "../../core/api/async-store";
import { formatBytes, formatDimensions } from "../../core/format/format";
import { NotificationService } from "../../core/notifications/notification.service";
import {
  buildPresetOperations,
  DEFAULT_PRESET_FORM_OPERATIONS,
  parsePresetOperations,
  type PresetFormOperations,
} from "../../core/presets/preset-operations";
import { computeProviderCompatibility } from "../../core/presets/provider-compatibility";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { ErrorState } from "../../ui/error-state.component";
import { LoadingGrid } from "../../ui/loading-grid.component";

interface BasicFields {
  name: string;
  slug: string;
  description: string;
  outputFormat: "auto" | "avif" | "webp" | "jpeg" | "png";
  quality: number | null;
}

const DEFAULT_BASIC_FIELDS: BasicFields = {
  name: "",
  slug: "",
  description: "",
  outputFormat: "auto",
  quality: null,
};

/**
 * The preset editor — shared by `/presets/new` and `/presets/:presetId`. A system preset opens
 * the exact same component with every field disabled: it is real, current data, just not
 * editable (see `PresetRepository`'s server-side enforcement, which this mirrors rather than
 * duplicates — the Save button is simply absent, not silently broken).
 */
@Component({
  selector: "ix-preset-editor",
  standalone: true,
  imports: [
    RouterLink,
    VoltBadge,
    VoltButton,
    VoltInput,
    VoltNativeSelect,
    VoltSwitch,
    VoltTextarea,
    LmnCheckCircleIcon,
    LmnExclamationCircleIcon,
    ErrorState,
    LoadingGrid,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-2xl font-semibold text-foreground">{{ heading() }}</h1>
        <a routerLink="/presets">
          <volt-button
            variant="outline"
            size="sm"
            (click)="confirmLeave($event)"
            >Back to presets</volt-button
          >
        </a>
      </div>

      @if (presetId() && loading.isLoading()) {
        <ix-loading-grid [count]="1" layout="rows" label="Loading preset…" />
      } @else if (loading.error(); as error) {
        <ix-error-state [error]="error" (retry)="reloadExisting()" />
      } @else {
        @if (isSystem()) {
          <p
            class="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
            role="status"
          >
            This is a system preset and cannot be edited or deleted. Duplicate
            it from the Presets list to create an editable copy.
          </p>
        }

        @if (equivalentPreset(); as existing) {
          <div
            class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <span>
              An equivalent preset already exists:
              <strong>{{ existing.name }}</strong> ({{ existing.slug }}).
            </span>
            <a [routerLink]="['/presets', existing.presetId]">
              <volt-button variant="outline" size="sm"
                >Open existing preset</volt-button
              >
            </a>
          </div>
        }

        <form class="flex flex-col gap-6" (submit)="save($event)">
          <section
            class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <h2 class="text-sm font-semibold">Basics</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-foreground leading-none">Name</span>
                <volt-input
                  id="preset-name"
                  [value]="basics().name"
                  [disabled]="isSystem()"
                  (valueChange)="onNameChange($event)"
                  data-testid="preset-name-input"
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-foreground leading-none">Slug</span>
                <volt-input
                  id="preset-slug"
                  [value]="basics().slug"
                  [disabled]="isSystem() || !!presetId()"
                  (valueChange)="patchBasics({ slug: $event })"
                  data-testid="preset-slug-input"
                />
                @if (presetId()) {
                  <p class="text-xs text-muted-foreground">
                    The slug cannot be changed after creation.
                  </p>
                }
              </label>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-foreground leading-none">Description</span>
              <volt-textarea
                id="preset-description"
                [rows]="2"
                [disabled]="isSystem()"
                [value]="basics().description"
                (valueChange)="patchBasics({ description: $event })"
              />
            </label>
          </section>

          <section
            class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold">Resize</h2>
              <label class="flex items-center">
                <span class="sr-only">Enable resize</span>
                <volt-switch
                  [checked]="ops().resizeEnabled"
                  [disabled]="isSystem()"
                  (checkedChange)="patchOps({ resizeEnabled: $event })"
                />
              </label>
            </div>
            @if (ops().resizeEnabled) {
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Width</span>
                  <volt-input
                    id="resize-width"
                    type="number"
                    [disabled]="isSystem()"
                    [value]="numberInputValue(ops().width)"
                    (valueChange)="patchOps({ width: numberOrNull($event) })"
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Height</span>
                  <volt-input
                    id="resize-height"
                    type="number"
                    [disabled]="isSystem()"
                    [value]="numberInputValue(ops().height)"
                    (valueChange)="patchOps({ height: numberOrNull($event) })"
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Fit</span>
                  <volt-native-select
                    id="resize-fit"
                    [disabled]="isSystem()"
                    (change)="patchOps({ fit: $any($event.target).value })"
                  >
                    @for (fit of fitOptions; track fit) {
                      <option [value]="fit" [selected]="fit === ops().fit">
                        {{ fit }}
                      </option>
                    }
                  </volt-native-select>
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Position</span>
                  <volt-native-select
                    id="resize-position"
                    [disabled]="isSystem()"
                    (change)="
                      patchOps({ position: $any($event.target).value || null })
                    "
                  >
                    <option value="" [selected]="!ops().position">
                      Default
                    </option>
                    @for (position of positionOptions; track position) {
                      <option
                        [value]="position"
                        [selected]="position === ops().position"
                      >
                        {{ position }}
                      </option>
                    }
                  </volt-native-select>
                </label>
              </div>
              <label class="flex items-center gap-2 text-sm">
                <volt-switch
                  [checked]="ops().withoutEnlargement"
                  [disabled]="isSystem()"
                  (checkedChange)="patchOps({ withoutEnlargement: $event })"
                />
                <span class="text-muted-foreground"
                  >Never enlarge beyond the original</span
                >
              </label>
            }
          </section>

          <section
            class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold">Crop</h2>
              <label class="flex items-center">
                <span class="sr-only">Enable crop</span>
                <volt-switch
                  [checked]="ops().cropEnabled"
                  [disabled]="isSystem()"
                  (checkedChange)="patchOps({ cropEnabled: $event })"
                  data-testid="crop-enabled-switch"
                />
              </label>
            </div>
            @if (ops().cropEnabled) {
              <div class="grid gap-4 sm:grid-cols-4">
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">X</span>
                  <volt-input
                    id="crop-x"
                    type="number"
                    [disabled]="isSystem()"
                    [value]="String(ops().cropX)"
                    (valueChange)="patchOps({ cropX: numberOrZero($event) })"
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Y</span>
                  <volt-input
                    id="crop-y"
                    type="number"
                    [disabled]="isSystem()"
                    [value]="String(ops().cropY)"
                    (valueChange)="patchOps({ cropY: numberOrZero($event) })"
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Width</span>
                  <volt-input
                    id="crop-width"
                    type="number"
                    [disabled]="isSystem()"
                    [value]="String(ops().cropWidth)"
                    (valueChange)="
                      patchOps({ cropWidth: numberOrZero($event) })
                    "
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium text-foreground leading-none">Height</span>
                  <volt-input
                    id="crop-height"
                    type="number"
                    [disabled]="isSystem()"
                    [value]="String(ops().cropHeight)"
                    (valueChange)="
                      patchOps({ cropHeight: numberOrZero($event) })
                    "
                  />
                </label>
              </div>
            }
          </section>

          <section
            class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <h2 class="text-sm font-semibold">Output</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-foreground leading-none">Format</span>
                <volt-native-select
                  id="output-format"
                  [disabled]="isSystem()"
                  (change)="
                    patchBasics({ outputFormat: $any($event.target).value })
                  "
                >
                  @for (format of formatOptions; track format) {
                    <option
                      [value]="format"
                      [selected]="format === basics().outputFormat"
                    >
                      {{ format }}
                    </option>
                  }
                </volt-native-select>
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-foreground leading-none"
                  >Quality (blank = default)</span
                >
                <volt-input
                  id="output-quality"
                  type="number"
                  [disabled]="isSystem()"
                  [value]="numberInputValue(basics().quality)"
                  (valueChange)="patchBasics({ quality: numberOrNull($event) })"
                />
              </label>
            </div>

            <label class="flex items-center gap-2 text-sm">
              <volt-switch
                [checked]="ops().backgroundEnabled"
                [disabled]="isSystem()"
                (checkedChange)="patchOps({ backgroundEnabled: $event })"
              />
              <span class="text-muted-foreground">Background</span>
              @if (ops().backgroundEnabled) {
                <volt-input
                  [value]="ops().backgroundColor"
                  [disabled]="isSystem()"
                  (valueChange)="patchOps({ backgroundColor: $event })"
                  aria-label="Background color"
                  class="w-32"
                />
              }
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-foreground leading-none">Metadata</span>
              <volt-native-select
                id="output-metadata"
                [disabled]="isSystem()"
                (change)="patchOps({ metadataMode: $any($event.target).value })"
              >
                <option value="keep" [selected]="ops().metadataMode === 'keep'">
                  Keep
                </option>
                <option
                  value="strip"
                  [selected]="ops().metadataMode === 'strip'"
                >
                  Strip all
                </option>
                <option
                  value="strip-location"
                  [selected]="ops().metadataMode === 'strip-location'"
                >
                  Strip location only
                </option>
              </volt-native-select>
            </label>
          </section>

          <section
            class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <h2 class="text-sm font-semibold">Effects</h2>
            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-foreground leading-none">Rotate</span>
              <span class="flex items-center gap-2">
                <label class="flex items-center">
                  <span class="sr-only">Enable rotate</span>
                  <volt-switch
                    [checked]="ops().rotateEnabled"
                    [disabled]="isSystem()"
                    (checkedChange)="patchOps({ rotateEnabled: $event })"
                  />
                </label>
                @if (ops().rotateEnabled) {
                  <volt-native-select
                    id="effect-rotate"
                    [disabled]="isSystem()"
                    (change)="
                      patchOps({
                        rotateDegrees: $any(Number($any($event.target).value)),
                      })
                    "
                  >
                    @for (degrees of rotationOptions; track degrees) {
                      <option
                        [value]="degrees"
                        [selected]="degrees === ops().rotateDegrees"
                      >
                        {{ degrees }}°
                      </option>
                    }
                  </volt-native-select>
                }
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-4">
              <label class="flex items-center gap-2 text-sm">
                <volt-switch
                  [checked]="ops().flipHorizontal"
                  [disabled]="isSystem()"
                  (checkedChange)="patchOps({ flipHorizontal: $event })"
                />
                <span>Flip horizontal</span>
              </label>
              <label class="flex items-center gap-2 text-sm">
                <volt-switch
                  [checked]="ops().flipVertical"
                  [disabled]="isSystem()"
                  (checkedChange)="patchOps({ flipVertical: $event })"
                />
                <span>Flip vertical</span>
              </label>
              <label class="flex items-center gap-2 text-sm">
                <volt-switch
                  [checked]="ops().grayscaleEnabled"
                  [disabled]="isSystem()"
                  (checkedChange)="patchOps({ grayscaleEnabled: $event })"
                  data-testid="grayscale-switch"
                />
                <span>Grayscale</span>
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label class="flex items-center gap-2 text-sm">
                  <volt-switch
                    [checked]="ops().blurEnabled"
                    [disabled]="isSystem()"
                    (checkedChange)="patchOps({ blurEnabled: $event })"
                  />
                  <span>Blur</span>
                </label>
                @if (ops().blurEnabled) {
                  <input
                    type="range"
                    min="0"
                    max="100"
                    [disabled]="isSystem()"
                    [value]="ops().blurValue"
                    (input)="
                      patchOps({
                        blurValue: numberOrZero($any($event.target).value),
                      })
                    "
                    aria-label="Blur amount"
                  />
                }
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="flex items-center gap-2 text-sm">
                  <volt-switch
                    [checked]="ops().sharpenEnabled"
                    [disabled]="isSystem()"
                    (checkedChange)="patchOps({ sharpenEnabled: $event })"
                  />
                  <span>Sharpen</span>
                </label>
                @if (ops().sharpenEnabled) {
                  <input
                    type="range"
                    min="0"
                    max="100"
                    [disabled]="isSystem()"
                    [value]="ops().sharpenValue"
                    (input)="
                      patchOps({
                        sharpenValue: numberOrZero($any($event.target).value),
                      })
                    "
                    aria-label="Sharpen amount"
                  />
                }
              </div>
            </div>
          </section>

          <section
            class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <h2 class="text-sm font-semibold">Resulting operation chain</h2>
            <p class="text-xs text-muted-foreground">
              The domain preserves this order exactly — it is never silently
              reordered.
            </p>
            <ol class="flex flex-wrap gap-2 text-xs">
              @for (op of builtOperations(); track $index) {
                <li class="rounded-full border border-border px-2 py-1">
                  {{ op.type }}
                </li>
              } @empty {
                <li class="text-muted-foreground">No operations</li>
              }
            </ol>
          </section>

          <section
            class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <h2 class="text-sm font-semibold">Provider compatibility</h2>
            <ul
              class="flex flex-col gap-1.5 text-sm"
              data-testid="provider-compatibility"
            >
              @for (entry of compatibility(); track entry.provider) {
                <li class="flex items-center gap-2">
                  @if (entry.supported) {
                    <lmn-check-circle [size]="14" tone="success" />
                  } @else {
                    <lmn-exclamation-circle [size]="14" tone="destructive" />
                  }
                  <span class="font-medium">{{ entry.label }}:</span>
                  <span class="text-muted-foreground">
                    @if (entry.supported) {
                      supported
                    } @else if (entry.unsupportedOperations.length > 0) {
                      unsupported: {{ entry.unsupportedOperations.join(", ") }}
                    } @else {
                      output format unsupported
                    }
                  </span>
                </li>
              }
            </ul>
          </section>

          <section
            class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold">Preview</h2>
              @if (presetId()) {
                <volt-button
                  variant="outline"
                  size="sm"
                  [disabled]="previewState() === 'loading'"
                  (click)="runPreview()"
                  data-testid="preset-preview-run"
                >
                  {{ previewState() === "loading" ? "Previewing…" : "Preview" }}
                </volt-button>
              }
            </div>
            @if (!presetId()) {
              <p class="text-sm text-muted-foreground">
                Save this preset to preview it against a real source size.
              </p>
            } @else if (previewResult(); as result) {
              <div class="flex flex-wrap items-center gap-3 text-sm">
                <img
                  [src]="result.previewUrl"
                  alt=""
                  class="h-16 w-16 rounded border border-border object-cover"
                />
                <span>{{ formatDims(result.width, result.height) }}</span>
                <span>{{ result.outputFormat }}</span>
                <span>{{ formatSize(result.sizeBytes) }}</span>
                <volt-badge variant="outline"
                  >Simulated transformation</volt-badge
                >
              </div>
            }
          </section>

          @if (submitError(); as error) {
            <p class="text-sm text-destructive" role="alert">
              {{ error.detail }}
            </p>
          }

          @if (!isSystem()) {
            <div class="flex items-center gap-2 border-t border-border pt-4">
              <volt-button
                variant="solid"
                size="sm"
                type="submit"
                [disabled]="saving()"
                data-testid="preset-save"
              >
                {{
                  saving()
                    ? "Saving…"
                    : presetId()
                      ? "Save changes"
                      : "Create preset"
                }}
              </volt-button>
              @if (isDirty()) {
                <span class="text-xs text-muted-foreground" role="status"
                  >Unsaved changes</span
                >
              }
            </div>
          }
        </form>
      }
    </div>
  `,
})
export class PresetEditor {
  /** `null` for `/presets/new`; a real id for `/presets/:presetId`. */
  readonly presetId = input.required<string | null>();

  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly context = inject(ProjectContextService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = new AsyncStore<ImagePreset>();
  protected readonly basics = signal<BasicFields>(DEFAULT_BASIC_FIELDS);
  protected readonly ops = signal<PresetFormOperations>(
    DEFAULT_PRESET_FORM_OPERATIONS,
  );
  protected readonly saving = signal(false);
  protected readonly submitError = signal<ApiErrorInfo | null>(null);
  protected readonly equivalentPreset = signal<{
    presetId: string;
    name: string;
    slug: string;
  } | null>(null);
  protected readonly previewResult = signal<PreviewPresetResponse | null>(null);
  protected readonly previewState = signal<"idle" | "loading">("idle");

  private baseline: { basics: BasicFields; ops: PresetFormOperations } | null =
    null;
  private slugTouched = false;
  private existingPreset: ImagePreset | null = null;

  protected readonly fitOptions = [
    "cover",
    "contain",
    "scale-down",
    "crop",
    "pad",
  ] as const;
  protected readonly positionOptions = [
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ] as const;
  protected readonly formatOptions = [
    "auto",
    "avif",
    "webp",
    "jpeg",
    "png",
  ] as const;
  protected readonly rotationOptions = [90, 180, 270] as const;
  protected readonly String = String;
  protected readonly Number = Number;

  protected readonly isSystem = computed(
    () => this.existingPreset?.isSystem ?? false,
  );
  protected readonly heading = computed(() =>
    this.presetId() ? (this.existingPreset?.name ?? "Preset") : "New preset",
  );

  protected readonly builtOperations = computed(() =>
    buildPresetOperations(this.ops()),
  );
  protected readonly compatibility = computed(() =>
    computeProviderCompatibility(
      this.builtOperations(),
      this.basics().outputFormat,
    ),
  );

  protected readonly isDirty = computed(() => {
    if (!this.baseline) return false;
    return (
      JSON.stringify(this.baseline.basics) !== JSON.stringify(this.basics()) ||
      JSON.stringify(this.baseline.ops) !== JSON.stringify(this.ops())
    );
  });

  constructor() {
    effect(() => {
      const id = this.presetId();
      // `loadExisting`/`resetToNew` read and write `loading`'s internal signal (AsyncStore.state)
      // synchronously before their first await. Left tracked, that write would re-dirty this same
      // effect and loop it forever — see the asset workspace page for the same pattern.
      untracked(() => {
        if (id) void this.loadExisting(id);
        else this.resetToNew();
      });
    });

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (this.isDirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener("beforeunload", warnBeforeUnload),
    );
  }

  private resetToNew(): void {
    this.existingPreset = null;
    this.slugTouched = false;
    const basics = { ...DEFAULT_BASIC_FIELDS };
    const ops = { ...DEFAULT_PRESET_FORM_OPERATIONS };
    this.basics.set(basics);
    this.ops.set(ops);
    this.baseline = { basics, ops };
  }

  private async loadExisting(id: string): Promise<void> {
    const preset = await this.loading.load(() => this.client.presets.get(id));
    if (!preset) return;
    this.existingPreset = preset;
    this.slugTouched = true;
    const basics: BasicFields = {
      name: preset.name,
      slug: preset.slug,
      description: preset.description ?? "",
      outputFormat: preset.outputFormat,
      quality: preset.quality,
    };
    const ops = parsePresetOperations(preset.operations);
    this.basics.set(basics);
    this.ops.set(ops);
    this.baseline = { basics, ops };
  }

  protected reloadExisting(): void {
    const id = this.presetId();
    if (id) void this.loadExisting(id);
  }

  protected patchBasics(change: Partial<BasicFields>): void {
    this.basics.update((current) => ({ ...current, ...change }));
  }

  protected patchOps(change: Partial<PresetFormOperations>): void {
    this.ops.update((current) => ({ ...current, ...change }));
  }

  protected onNameChange(name: string): void {
    this.patchBasics({ name });
    if (!this.slugTouched && !this.presetId()) {
      this.patchBasics({ slug: slugifyPresetName(name) });
    }
  }

  protected numberInputValue(value: number | null): string {
    return value === null ? "" : String(value);
  }

  protected numberOrNull(value: string): number | null {
    const parsed = Number(value);
    return value.trim() === "" || Number.isNaN(parsed) ? null : parsed;
  }

  protected numberOrZero(value: string): number {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  protected formatDims(width: number | null, height: number | null): string {
    return formatDimensions(width, height);
  }

  protected formatSize(size: number): string {
    return formatBytes(size);
  }

  protected confirmLeave(event: Event): void {
    if (!this.isDirty()) return;
    const confirmed = globalThis.confirm(
      "Discard unsaved changes to this preset?",
    );
    if (!confirmed) event.preventDefault();
  }

  protected async runPreview(): Promise<void> {
    const id = this.presetId();
    if (!id) return;
    this.previewState.set("loading");
    try {
      const result = await this.client.presets.preview(id);
      this.previewResult.set(result);
    } catch (error) {
      this.notifications.error(
        "Preview failed",
        describeApiError(error).detail,
      );
    } finally {
      this.previewState.set("idle");
    }
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isSystem()) return;

    const projectId = this.context.selectedProjectId();
    if (!projectId) return;

    this.saving.set(true);
    this.submitError.set(null);
    this.equivalentPreset.set(null);

    try {
      const operations = this.builtOperations();
      const basics = this.basics();

      if (this.presetId()) {
        const updated = await this.client.presets.update(this.presetId()!, {
          name: basics.name.trim(),
          description: basics.description.trim() || null,
          operations,
          outputFormat: basics.outputFormat,
          quality: basics.quality,
        });
        this.existingPreset = updated;
        this.baseline = { basics: { ...basics }, ops: { ...this.ops() } };
        this.notifications.success(
          "Preset saved",
          `"${updated.name}" updated.`,
        );
      } else {
        const created = await this.client.presets.create({
          projectId,
          name: basics.name.trim(),
          slug: basics.slug.trim() || undefined,
          description: basics.description.trim() || null,
          operations,
          outputFormat: basics.outputFormat,
          quality: basics.quality ?? undefined,
        });
        this.baseline = { basics: { ...basics }, ops: { ...this.ops() } };
        this.notifications.success(
          "Preset created",
          `"${created.name}" created.`,
        );
        void this.router.navigate(["/presets", created.id], {
          replaceUrl: true,
        });
      }
    } catch (error) {
      if (conflictCode(error) === "equivalent_preset_exists") {
        // `details` carries the structured `{ presetId, slug }` the route attaches — the real
        // identifiers, not something parsed back out of a prose message. The name isn't part of
        // that payload (see api-worker's presets route), so it's read from the one place it does
        // appear: the message's own quoted segment, in the exact format that route always emits.
        const details = conflictDetails(error);
        const presetId =
          typeof details?.["presetId"] === "string" ? details["presetId"] : "";
        const slug =
          typeof details?.["slug"] === "string" ? details["slug"] : "";
        this.equivalentPreset.set({
          presetId,
          slug,
          name: extractEquivalentName(describeApiError(error).detail),
        });
      }
      this.submitError.set(describeApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}

function slugifyPresetName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Pulls the preset name out of `equivalent_preset_exists`'s fixed message shape (`'... "name" (slug).'`) — the only place that name currently appears. */
function extractEquivalentName(detail: string): string {
  const match = /: "([^"]+)"/.exec(detail);
  return match?.[1] ?? "an existing preset";
}
