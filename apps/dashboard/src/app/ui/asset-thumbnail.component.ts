import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AssetListItem } from "@imageryx/sdk";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import {
  placeholderBackground,
  resolveThumbnailPreset,
  thumbnailFallbackLabel,
  thumbnailFallbackReason,
} from "./asset-thumbnail";

/**
 * An asset's tile image, in three layers so a grid never blocks on network work:
 *
 * 1. the checksum-derived placeholder colour, painted immediately with no request at all;
 * 2. on top of it, a real thumbnail — but only for a preset whose variant is already `ready`,
 *    and only via `loading="lazy"` so off-screen tiles cost nothing;
 * 3. if that image fails anyway (a variant deleted between list and render, delivery worker
 *    down), the placeholder stays and the tile says what happened.
 *
 * The original is never a fallback. See `asset-thumbnail.ts` for the full reasoning.
 */
@Component({
  selector: "ix-asset-thumbnail",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-muted"
      [style.background]="background() ?? undefined"
      data-testid="asset-thumbnail"
    >
      @if (thumbnailUrl(); as url) {
        @if (!loadFailed()) {
          <img
            [src]="url"
            [alt]="alt()"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover"
            (error)="loadFailed.set(true)"
          />
        }
      }

      @if (overlayLabel(); as label) {
        <span
          class="pointer-events-none absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground backdrop-blur-sm"
        >
          {{ label }}
        </span>
      }
    </div>
  `,
})
export class AssetThumbnail {
  readonly asset = input.required<AssetListItem>();
  readonly projectSlug = input.required<string>();

  private readonly client = inject(IMAGERYX_CLIENT);
  protected readonly loadFailed = signal(false);

  protected readonly background = computed(() =>
    placeholderBackground(this.asset()),
  );

  protected readonly thumbnailUrl = computed(() => {
    const preset = resolveThumbnailPreset(this.asset());
    if (!preset) return null;
    return this.client.delivery.presetUrl(
      this.projectSlug(),
      this.asset().path,
      preset,
    );
  });

  /**
   * Decorative when a real image is showing (the asset's name is already the card's heading, so
   * repeating it here would make a screen reader announce it twice); descriptive otherwise.
   */
  protected readonly alt = computed(() => "");

  protected readonly overlayLabel = computed(() => {
    if (this.loadFailed()) return "Preview unavailable";
    const reason = thumbnailFallbackReason(this.asset());
    return reason ? thumbnailFallbackLabel(reason) : null;
  });
}
