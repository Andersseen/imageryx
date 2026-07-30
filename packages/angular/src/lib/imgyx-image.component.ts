import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import {
  resolveAspectRatio,
  resolveBackgroundStyle,
  resolveImageSrc,
  resolveSrcset,
  type ResponsivePresetInput,
} from "./image-url";

export type ImageLoadingStrategy = "lazy" | "eager";
export type ImageFetchPriority = "high" | "low" | "auto";

/**
 * Renders one Imageryx asset as a standard `<img>`, resolving delivery
 * URLs through `@imageryx/image-core`'s shared builder — never calls
 * `api-worker` and never touches an API key (see README's "Authentication"
 * section: this component only ever consumes public or signed delivery
 * URLs, exactly like a plain `<img src>` would).
 */
@Component({
  selector: "imgyx-image",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      [src]="currentSrc()"
      [attr.srcset]="srcset() || null"
      [attr.sizes]="sizes() || null"
      [alt]="alt()"
      [attr.width]="width() ?? null"
      [attr.height]="height() ?? null"
      [attr.loading]="loading()"
      [attr.fetchpriority]="fetchPriority() ?? null"
      [style.aspect-ratio]="aspectRatio()"
      [style.background]="backgroundStyle()"
      (load)="onLoad()"
      (error)="onError()"
    />
  `,
})
export class ImgyxImage {
  readonly project = input.required<string>();
  readonly asset = input.required<string>();
  readonly preset = input<string>();
  /** Pass `""` explicitly for a decorative image — required so a missing `alt` is a compile error, not a silent accessibility gap. */
  readonly alt = input.required<string>();
  readonly width = input<number>();
  readonly height = input<number>();
  readonly sizes = input<string>();
  readonly loading = input<ImageLoadingStrategy>("lazy");
  readonly fetchPriority = input<ImageFetchPriority>();
  /** A CSS color or an image URL (including `data:` URIs), shown as the background until the image loads. */
  readonly placeholder = input<string>();
  /** Swapped in once, on the first `error` event. */
  readonly fallback = input<string>();
  readonly deliveryBaseUrl = input.required<string>();
  readonly responsivePresets = input<ResponsivePresetInput[]>();

  // Named `imageLoad`/`imageError`, not `load`/`error`: Angular's linter (rightly) flags
  // component outputs shadowing native DOM event names, which would be ambiguous on a
  // `<imgyx-image (load)>` host binding — is that this component's output or the native event?
  readonly imageLoad = output<void>();
  readonly imageError = output<void>();

  private readonly hasFallenBack = signal(false);

  private readonly primarySrc = computed(() =>
    resolveImageSrc(this.deliveryBaseUrl(), this.project(), this.asset(), this.preset()),
  );

  readonly currentSrc = computed(() => {
    const fallback = this.fallback();
    return this.hasFallenBack() && fallback ? fallback : this.primarySrc();
  });

  readonly srcset = computed(() =>
    resolveSrcset(this.deliveryBaseUrl(), this.project(), this.asset(), this.responsivePresets()),
  );

  readonly aspectRatio = computed(() => resolveAspectRatio(this.width(), this.height()));
  readonly backgroundStyle = computed(() => resolveBackgroundStyle(this.placeholder()));

  protected onLoad(): void {
    this.imageLoad.emit();
  }

  protected onError(): void {
    if (this.fallback() && !this.hasFallenBack()) {
      this.hasFallenBack.set(true);
    }
    this.imageError.emit();
  }
}
