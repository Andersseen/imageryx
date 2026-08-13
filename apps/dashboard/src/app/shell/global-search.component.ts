import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { VoltInput } from "@voltui/components";
import { LmnMagnifyingGlassIcon } from "lumen-icons";

/**
 * Topbar search. Submitting navigates to `/library` with `?q=…` rather than filtering in place.
 *
 * That indirection is deliberate: the library page already owns search as one dimension of its
 * query (see `asset-query.ts`), and driving it through the URL means a search is shareable,
 * survives reload, and leaves the browser Back button working — none of which is true of a
 * search box that mutates hidden component state.
 *
 * A real `<form>` wrapper, not a keydown handler, so Enter submits natively and mobile keyboards
 * show a "search" action key.
 */
@Component({
  selector: "ix-global-search",
  standalone: true,
  imports: [VoltInput, LmnMagnifyingGlassIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="flex w-full items-center gap-2"
      role="search"
      (submit)="submit($event)"
    >
      <label class="sr-only" for="global-search">Search assets</label>
      <div class="relative w-full">
        <span
          class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        >
          <lmn-magnifying-glass [size]="16" tone="muted" />
        </span>
        <!--
          The icon is overlaid on the field, so the field has to reserve room for it: Volt's inner
          <input> sets its own px-3, which put the placeholder underneath the icon rather than
          beside it. pl-9 clears the icon's 10px offset plus its 16px box.
        -->
        <volt-input
          id="global-search"
          type="search"
          class="w-full [&_input]:pl-9"
          placeholder="Search assets…"
          [value]="term()"
          (valueChange)="term.set($event)"
          data-testid="global-search-input"
        />
      </div>
      <button type="submit" class="sr-only">Search</button>
    </form>
  `,
})
export class GlobalSearch {
  private readonly router = inject(Router);
  protected readonly term = signal("");

  protected submit(event: Event): void {
    event.preventDefault();
    const query = this.term().trim();
    void this.router.navigate(["/library"], {
      queryParams: { q: query || null },
      // Merges so an in-progress folder/tag filter survives a search from the topbar.
      queryParamsHandling: "merge",
    });
  }
}
