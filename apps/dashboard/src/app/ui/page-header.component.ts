import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * The `<h1>` and supporting copy every route starts with, plus a projected slot for that
 * route's primary actions. Exists so page titles stay a consistent size and, more importantly,
 * so every route has exactly one `<h1>` — a heading level skipped or duplicated is one of the
 * easiest accessibility regressions to introduce page by page.
 */
@Component({
  selector: "ix-page-header",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">
          {{ title() }}
        </h1>
        @if (description()) {
          <p class="max-w-2xl text-sm text-muted-foreground">
            {{ description() }}
          </p>
        }
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input<string>("");
}
