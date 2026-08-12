import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import {
  VoltAvatar,
  VoltAvatarFallback,
  VoltButton,
  VoltSidebarService,
} from "@voltui/components";
import { AuthSessionService } from "../core/auth/auth-session.service";

/**
 * Sidebar footer: who is signed in, and the way out.
 *
 * The three label derivations live here rather than on `AppComponent` because this is the only
 * thing that renders them. They are `computed` over the session signal, so a name arriving
 * late (the session response resolves after first paint) updates the row without a manual
 * refresh.
 *
 * Collapsed, only the avatar remains: the name, email and sign-out control are all text-width
 * and would overflow a rail. Sign-out stays reachable by expanding the sidebar.
 */
@Component({
  selector: "ix-sidebar-user",
  standalone: true,
  imports: [VoltAvatar, VoltAvatarFallback, VoltButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2">
      <volt-avatar>
        <volt-avatar-fallback>{{ initials() }}</volt-avatar-fallback>
      </volt-avatar>
      @if (!sidebar.isCollapsed()) {
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-medium text-foreground">
            {{ label() }}
          </span>
          <span class="truncate text-xs text-muted-foreground">
            {{ detail() }}
          </span>
        </div>
        <!-- ml-auto has to sit on this wrapper, not on volt-button: that component declares
             "class" as an Angular input, so the value styles its inner button element and
             never reaches the custom-element host, which is the actual flex item here. -->
        <div class="ml-auto">
          <volt-button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            (click)="signOut()"
          >
            Sign out
          </volt-button>
        </div>
      }
    </div>
  `,
})
export class SidebarUser {
  protected readonly sidebar = inject(VoltSidebarService);
  private readonly auth = inject(AuthSessionService);

  protected readonly label = computed(() => {
    const user = this.auth.user();
    return user?.name ?? user?.email ?? "Workspace owner";
  });

  protected readonly detail = computed(
    () => this.auth.user()?.email ?? "Signed in",
  );

  /** First letter of at most the first two words — "Andrii Pap" reads as "AP". */
  protected readonly initials = computed(() =>
    this.label()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
  );

  protected async signOut(): Promise<void> {
    await this.auth.logout();
  }
}
