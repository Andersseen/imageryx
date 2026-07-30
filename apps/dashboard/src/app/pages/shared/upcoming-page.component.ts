import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { VoltBadge } from '@voltui/components';

/**
 * Static placeholder for routes whose real functionality lands in Phase 4.
 * Deliberately has no interactive controls, so nothing on the page looks
 * functional without being functional.
 */
@Component({
  selector: 'ix-upcoming-page',
  standalone: true,
  imports: [VoltBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-2xl flex-col items-start gap-4 py-12">
      <volt-badge variant="outline">Upcoming — Phase 4</volt-badge>
      <h1 class="text-2xl font-semibold text-foreground">{{ title() }}</h1>
      <p class="text-muted-foreground">{{ description() }}</p>
      <p class="text-sm text-muted-foreground">
        This route exists so the navigation and URL structure are stable, but the screen itself is
        intentionally empty in Phase 1 — no controls here are wired up yet.
      </p>
    </div>
  `,
})
export class UpcomingPage {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
}
