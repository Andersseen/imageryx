import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { VoltSkeleton } from "@voltui/components";

/**
 * First-load placeholders shaped like the content that replaces them, so the page does not jump
 * when data arrives. `aria-busy` plus an off-screen status line means the wait is announced
 * once rather than as a dozen empty list items.
 */
@Component({
  selector: "ix-loading-grid",
  standalone: true,
  imports: [VoltSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div aria-busy="true" data-testid="loading-grid">
      <span class="sr-only" role="status">{{ label() }}</span>
      @if (layout() === "grid") {
        <div
          class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4"
          aria-hidden="true"
        >
          @for (item of placeholders(); track item) {
            <div
              class="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <volt-skeleton variant="rectangle" class="aspect-[4/3] w-full" />
              <volt-skeleton variant="text" width="70%" />
              <volt-skeleton variant="text" width="45%" />
            </div>
          }
        </div>
      } @else {
        <div class="flex flex-col gap-2" aria-hidden="true">
          @for (item of placeholders(); track item) {
            <div
              class="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <volt-skeleton
                variant="rectangle"
                width="2.5rem"
                height="2.5rem"
              />
              <volt-skeleton variant="text" width="30%" />
              <volt-skeleton variant="text" width="18%" />
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class LoadingGrid {
  readonly count = input<number>(8);
  readonly layout = input<"grid" | "rows">("grid");
  readonly label = input<string>("Loading…");

  protected readonly placeholders = computed(() =>
    Array.from({ length: this.count() }, (_, index) => index),
  );
}
