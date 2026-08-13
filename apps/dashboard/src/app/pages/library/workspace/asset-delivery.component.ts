import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AssetDetails } from "@imageryx/sdk";
import {
  VoltBadge,
  VoltInput,
  VoltLabel,
  VoltNativeSelect,
} from "@voltui/components";
import { buildDeliveryPresetOptions } from "../../../core/delivery/delivery-presets";
import {
  buildResponsiveHtmlSnippet,
  buildSdkSnippet,
} from "../../../core/delivery/snippets-extra";
import { IMAGERYX_CLIENT } from "../../../core/sdk/imageryx-client.token";
import { CopyButton } from "../../../ui/copy-button.component";

type LoadingStrategy = "lazy" | "eager";

/**
 * Real delivery URLs and real, copyable code snippets — HTML, responsive HTML, Angular and SDK.
 *
 * Every snippet is generated from URLs this asset's actual presets resolve to today, never a
 * fabricated example. A preset with no ready variant yet shows as "not generated" instead of
 * a link, and is excluded from the responsive `srcset` entirely — an unresolvable URL in a
 * `srcset` is worse than a shorter one.
 */
@Component({
  selector: "ix-asset-delivery",
  standalone: true,
  imports: [VoltBadge, VoltInput, VoltLabel, VoltNativeSelect, CopyButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">Delivery URLs</h2>
        <ul
          class="flex flex-col divide-y divide-border rounded-lg border border-border"
        >
          @if (originalUrl(); as url) {
            <li class="flex flex-wrap items-center justify-between gap-2 p-3">
              <div class="flex min-w-0 flex-col">
                <span class="text-sm font-medium">Original</span>
                <span
                  class="truncate font-mono text-xs text-muted-foreground"
                  >{{ url }}</span
                >
              </div>
              <ix-copy-button
                [value]="url"
                label="original delivery URL"
                idleLabel="Copy"
              />
            </li>
          } @else {
            <li class="p-3 text-sm text-muted-foreground">
              Original is private — only accessible via a signed download link
              (Download tab).
            </li>
          }

          @for (option of presetOptions(); track option.id) {
            <li class="flex flex-wrap items-center justify-between gap-2 p-3">
              <div class="flex min-w-0 flex-col">
                <span class="text-sm font-medium">{{ option.name }}</span>
                @if (option.url) {
                  <span
                    class="truncate font-mono text-xs text-muted-foreground"
                    >{{ option.url }}</span
                  >
                } @else {
                  <span class="text-xs text-muted-foreground"
                    >Not generated yet — see Variants tab.</span
                  >
                }
              </div>
              @if (option.url) {
                <ix-copy-button
                  [value]="option.url"
                  [label]="option.name + ' delivery URL'"
                  idleLabel="Copy"
                />
              }
            </li>
          }
        </ul>
      </section>

      <section
        class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <h2 class="text-sm font-semibold">Snippet options</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="delivery-alt">Alt text</volt-label>
            <volt-input
              id="delivery-alt"
              [value]="alt()"
              (valueChange)="alt.set($event)"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="delivery-loading">Loading strategy</volt-label>
            <select voltNativeSelect
              id="delivery-loading"
              (change)="loading.set($any($event.target).value)"
            >
              <option value="lazy" [selected]="loading() === 'lazy'">
                lazy
              </option>
              <option value="eager" [selected]="loading() === 'eager'">
                eager
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="delivery-sizes">Sizes</volt-label>
            <volt-input
              id="delivery-sizes"
              [value]="sizes()"
              (valueChange)="sizes.set($event)"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="delivery-class"
              >CSS class (optional)</volt-label
            >
            <volt-input
              id="delivery-class"
              [value]="cssClass()"
              (valueChange)="cssClass.set($event)"
            />
          </div>
        </div>

        @if (readyPresetOptions().length > 0) {
          <fieldset class="flex flex-col gap-1.5">
            <legend class="text-sm text-muted-foreground">
              Responsive presets (srcset)
            </legend>
            <div class="flex flex-wrap gap-3">
              @for (option of readyPresetOptions(); track option.id) {
                <label class="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    [checked]="selectedResponsiveIds().has(option.id)"
                    (change)="toggleResponsive(option.id)"
                  />
                  {{ option.name }}
                  @if (option.width) {
                    <span class="text-xs text-muted-foreground"
                      >({{ option.width }}w)</span
                    >
                  }
                </label>
              }
            </div>
          </fieldset>
        }
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">HTML</h2>
        <div class="flex items-start justify-between gap-2">
          <pre
            class="flex-1 overflow-x-auto rounded-md border border-border bg-card p-3 text-xs"
            data-testid="snippet-html"
            >{{ htmlSnippet() }}</pre
          >
          <ix-copy-button
            [value]="htmlSnippet()"
            label="HTML snippet"
            idleLabel="Copy"
          />
        </div>
      </section>

      @if (responsiveSnippet(); as snippet) {
        <section class="flex flex-col gap-2">
          <h2 class="text-sm font-semibold">Responsive HTML</h2>
          <div class="flex items-start justify-between gap-2">
            <pre
              class="flex-1 overflow-x-auto rounded-md border border-border bg-card p-3 text-xs"
              data-testid="snippet-responsive-html"
              >{{ snippet }}</pre
            >
            <ix-copy-button
              [value]="snippet"
              label="responsive HTML snippet"
              idleLabel="Copy"
            />
          </div>
        </section>
      }

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">Angular</h2>
        <div class="flex items-start justify-between gap-2">
          <pre
            class="flex-1 overflow-x-auto rounded-md border border-border bg-card p-3 text-xs"
            data-testid="snippet-angular"
            >{{ angularSnippet() }}</pre
          >
          <ix-copy-button
            [value]="angularSnippet()"
            label="Angular snippet"
            idleLabel="Copy"
          />
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">SDK</h2>
        <div class="flex items-start justify-between gap-2">
          <pre
            class="flex-1 overflow-x-auto rounded-md border border-border bg-card p-3 text-xs"
            data-testid="snippet-sdk"
            >{{ sdkSnippet() }}</pre
          >
          <ix-copy-button
            [value]="sdkSnippet()"
            label="SDK snippet"
            idleLabel="Copy"
          />
        </div>
      </section>
    </div>
  `,
})
export class AssetDelivery {
  readonly asset = input.required<AssetDetails>();

  private readonly client = inject(IMAGERYX_CLIENT);

  protected readonly alt = signal("");
  protected readonly loading = signal<LoadingStrategy>("lazy");
  protected readonly sizes = signal("100vw");
  protected readonly cssClass = signal("");
  protected readonly selectedResponsiveIds = signal<Set<string>>(new Set());

  protected readonly projectSlug = computed(
    () => this.asset().project?.slug ?? "",
  );

  protected readonly originalUrl = computed(() => {
    const asset = this.asset();
    if (asset.visibility !== "public" || !asset.project) return null;
    return this.client.delivery.originalUrl(asset.project.slug, asset.path);
  });

  protected readonly presetOptions = computed(() =>
    buildDeliveryPresetOptions(
      this.asset(),
      (project, path, preset) =>
        this.client.delivery.presetUrl(project, path, preset),
      this.projectSlug(),
    ),
  );

  protected readonly readyPresetOptions = computed(() =>
    this.presetOptions().filter((o) => o.ready),
  );

  protected toggleResponsive(id: string): void {
    this.selectedResponsiveIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  private effectiveAlt(): string {
    return this.alt().trim() || this.asset().name;
  }

  protected readonly htmlSnippet = computed(() =>
    this.client.snippets.html({
      project: this.projectSlug(),
      asset: this.asset().path,
      alt: this.effectiveAlt(),
      width: this.asset().width ?? undefined,
      height: this.asset().height ?? undefined,
    }),
  );

  protected readonly angularSnippet = computed(() =>
    this.client.snippets.angular({
      project: this.projectSlug(),
      asset: this.asset().path,
      alt: this.effectiveAlt(),
      width: this.asset().width ?? undefined,
      height: this.asset().height ?? undefined,
    }),
  );

  protected readonly sdkSnippet = computed(() => {
    const firstReady = this.readyPresetOptions()[0];
    return buildSdkSnippet({
      project: this.projectSlug(),
      asset: this.asset().path,
      preset: firstReady?.slug,
    });
  });

  protected readonly responsiveSnippet = computed(() => {
    const selected = this.presetOptions().filter(
      (o) => this.selectedResponsiveIds().has(o.id) && o.url && o.width,
    );
    if (selected.length === 0) return null;

    const srcset = selected.map((o) => `${o.url} ${o.width}w`).join(", ");
    const original = this.originalUrl();
    if (!original) return null;

    return buildResponsiveHtmlSnippet({
      originalUrl: original,
      srcset,
      sizes: this.sizes() || "100vw",
      alt: this.effectiveAlt(),
      width: this.asset().width ?? undefined,
      height: this.asset().height ?? undefined,
      cssClass: this.cssClass() || undefined,
    });
  });
}
