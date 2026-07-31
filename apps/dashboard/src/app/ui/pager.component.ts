import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import { VoltButton } from "@voltui/components";
import { LmnChevronLeftIcon, LmnChevronRightIcon } from "lumen-icons";

/**
 * Previous/next paging with a live position readout.
 *
 * Kept to two buttons rather than a numbered page strip: a numbered strip is a lot of controls
 * to keep accessible and responsive, and for a personal library "where am I / next / back" is
 * the whole interaction. The readout is a live region so a screen-reader user hears the new
 * position after activating a button, instead of having to go hunting for it.
 */
@Component({
  selector: "ix-pager",
  standalone: true,
  imports: [VoltButton, LmnChevronLeftIcon, LmnChevronRightIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="flex flex-wrap items-center justify-between gap-3"
      aria-label="Pagination"
      data-testid="pager"
    >
      <p class="text-sm text-muted-foreground" role="status" aria-live="polite">
        {{ summary() }}
      </p>

      <div class="flex items-center gap-2">
        <volt-button
          variant="outline"
          size="sm"
          [disabled]="page() <= 1"
          (click)="pageChange.emit(page() - 1)"
          data-testid="pager-previous"
        >
          <lmn-chevron-left slot="leading" [size]="14" />
          Previous
        </volt-button>
        <volt-button
          variant="outline"
          size="sm"
          [disabled]="page() >= totalPages()"
          (click)="pageChange.emit(page() + 1)"
          data-testid="pager-next"
        >
          Next
          <lmn-chevron-right slot="trailing" [size]="14" />
        </volt-button>
      </div>
    </nav>
  `,
})
export class Pager {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly itemLabel = input<string>("items");

  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))),
  );

  protected readonly summary = computed(() => {
    const total = this.total();
    if (total === 0) return `No ${this.itemLabel()}`;
    const first = (this.page() - 1) * this.pageSize() + 1;
    const last = Math.min(total, this.page() * this.pageSize());
    return `Showing ${first}–${last} of ${total} ${this.itemLabel()}`;
  });
}
