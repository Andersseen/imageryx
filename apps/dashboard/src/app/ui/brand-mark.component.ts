import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

/**
 * The square "Ix" monogram. Extracted because it appears in two places that must not drift
 * apart — the sign-in panel and the sidebar header — at two different sizes. Duplicating the
 * token classes in both was how the two ended up with subtly different weights.
 *
 * Not built on a Volt component: Volt has no monogram/logo primitive, and this is a single
 * styled `<span>` over theme tokens (`bg-primary`, `text-primary-foreground`), so it stays
 * inside the same design system without inventing a competing atom.
 */
@Component({
  selector: "ix-brand-mark",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span [class]="classes()" aria-hidden="true">Ix</span> `,
})
export class BrandMark {
  /** `sm` fits the sidebar header row; `md` is the sign-in panel's heading. */
  readonly size = input<"sm" | "md">("md");

  protected readonly classes = computed(() =>
    [
      "flex shrink-0 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground",
      this.size() === "sm" ? "h-7 w-7" : "h-9 w-9 font-semibold",
    ].join(" "),
  );
}
