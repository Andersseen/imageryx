import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { VoltBadge } from "@voltui/components";

/**
 * Static placeholder for routes whose real functionality lands in Phase 4B.
 *
 * Deliberately has no interactive controls, so nothing on the page looks functional without
 * being functional. The `upcoming` list states what the route will actually do — it should stay
 * accurate as Phase 4B lands, or be deleted along with the placeholder.
 */
@Component({
  selector: "ix-upcoming-page",
  standalone: true,
  imports: [VoltBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-2xl flex-col items-start gap-4 py-12">
      <volt-badge variant="outline">Upcoming — Phase 4B</volt-badge>
      <h1 class="text-2xl font-semibold text-foreground">{{ title() }}</h1>
      <p class="text-muted-foreground">{{ description() }}</p>
      @if (upcoming().length > 0) {
        <div class="flex flex-col gap-2">
          <h2 class="text-sm font-medium text-foreground">
            Planned for this route
          </h2>
          <ul class="list-disc pl-5 text-sm text-muted-foreground">
            @for (item of upcoming(); track item) {
              <li>{{ item }}</li>
            }
          </ul>
        </div>
      }
      <p class="text-sm text-muted-foreground">
        This route exists so the navigation and URL structure stay stable. Phase
        4A made the Library and Projects pages real; this screen is
        intentionally inert until Phase 4B.
      </p>
    </div>
  `,
})
export class UpcomingPage {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly upcoming = input<readonly string[]>([]);
}
