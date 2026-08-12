import { ChangeDetectionStrategy, Component } from "@angular/core";

/**
 * Shown while `AuthSessionService.refresh()` is still deciding whether there is a session.
 *
 * Deliberately not a skeleton of the real shell: at this point the app does not yet know
 * whether the user will land on the dashboard or the sign-in panel, so mimicking either
 * layout would flash the wrong one.
 */
@Component({
  selector: "ix-app-loading",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex h-dvh items-center justify-center bg-background text-foreground"
      role="status"
      aria-live="polite"
    >
      <p class="text-sm text-muted-foreground">Loading Imageryx...</p>
    </div>
  `,
})
export class AppLoading {}
