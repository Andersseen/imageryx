import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { AuthSessionService } from "./core/auth/auth-session.service";
import { ProjectContextService } from "./core/projects/project-context.service";
import { ThemeService } from "./core/theme/theme.service";
import { AppLoading } from "./shell/app-loading.component";
import { AppShell } from "./shell/app-shell.component";
import { SignInPanel } from "./shell/sign-in-panel.component";
import { ToastHost } from "./ui/toast-host.component";

/**
 * Root component. Its only rendering job is to pick which of the three session states is on
 * screen — each one owns its own layout, so nothing here knows what a sidebar or a sign-in
 * button looks like.
 *
 * `@switch` over the discriminant rather than a chain of `@if`/`@else if`: `AuthSessionState`
 * is a closed union of exactly these three cases, and naming each one makes an unhandled state
 * a visible gap instead of whatever the trailing `@else` happened to be.
 *
 * `ix-toast-host` sits outside the switch so a notification queued during sign-out survives the
 * swap back to the sign-in panel. It is `position: fixed` and `pointer-events-none` while
 * empty, so it costs nothing in the states that never raise a toast.
 */
@Component({
  selector: "ix-root",
  standalone: true,
  imports: [AppLoading, AppShell, SignInPanel, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      Skip to content
    </a>

    @switch (auth.session().status) {
      @case ("loading") {
        <ix-app-loading />
      }
      @case ("anonymous") {
        <ix-sign-in-panel />
      }
      @case ("authenticated") {
        <ix-app-shell />
      }
    }

    <ix-toast-host />
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthSessionService);
  /** Injected eagerly so the persisted/preferred theme applies before first paint. */
  private readonly theme = inject(ThemeService);
  private readonly projects = inject(ProjectContextService);

  constructor() {
    void this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    const state = await this.auth.refresh();
    if (state.status === "authenticated") {
      // Loaded once here rather than per route: the topbar's project switcher is always mounted,
      // and every project-scoped page would otherwise race to fetch the same list on activation.
      await this.projects.ensureLoaded();
    }
  }
}
