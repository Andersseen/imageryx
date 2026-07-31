import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/**
 * "Nothing here" is not one state but two, and conflating them is a real usability bug: a user
 * who has filtered everything away needs a *clear filters* affordance, while a user with a
 * genuinely empty project needs an *add something* affordance. `variant` picks which message
 * frame applies, and the caller projects the matching action.
 */
@Component({
  selector: "ix-empty-state",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center"
      data-testid="empty-state"
    >
      <h2 class="text-base font-medium text-foreground">{{ title() }}</h2>
      @if (description()) {
        <p class="max-w-md text-sm text-muted-foreground">
          {{ description() }}
        </p>
      }
      <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input<string>("");
}
