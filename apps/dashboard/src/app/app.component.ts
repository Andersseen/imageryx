import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import {
  VoltAvatar,
  VoltAvatarFallback,
  VoltSidebar,
  VoltSidebarContent,
  VoltSidebarFooter,
  VoltSidebarGroup,
  VoltSidebarHeader,
  VoltSidebarItem,
  VoltSidebarService,
} from "@voltui/components";
import { MoveEnterDirective } from "angular-movement";
import {
  LmnBeakerIcon,
  LmnCodeBracketIcon,
  LmnCog6ToothIcon,
  LmnCpuChipIcon,
  LmnFolderIcon,
  LmnGridIcon,
  LmnPhotoIcon,
  LmnSettingsIcon,
} from "lumen-icons";
import { ViewportService } from "quartz-headless";
import { AuthSessionService } from "./core/auth/auth-session.service";
import { ProjectContextService } from "./core/projects/project-context.service";
import { ThemeService } from "./core/theme/theme.service";
import { Topbar } from "./shell/topbar.component";
import { ToastHost } from "./ui/toast-host.component";

@Component({
  selector: "ix-root",
  standalone: true,
  imports: [
    RouterLink,
    RouterOutlet,
    VoltAvatar,
    VoltAvatarFallback,
    VoltSidebar,
    VoltSidebarContent,
    VoltSidebarFooter,
    VoltSidebarGroup,
    VoltSidebarHeader,
    VoltSidebarItem,
    LmnBeakerIcon,
    LmnCodeBracketIcon,
    LmnCog6ToothIcon,
    LmnCpuChipIcon,
    LmnFolderIcon,
    LmnGridIcon,
    LmnPhotoIcon,
    LmnSettingsIcon,
    MoveEnterDirective,
    Topbar,
    ToastHost,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      Skip to content
    </a>
    @if (auth.session().status === "loading") {
      <div
        class="flex h-dvh items-center justify-center bg-background text-foreground"
      >
        <div class="text-sm text-muted-foreground">Loading Imageryx...</div>
      </div>
    } @else if (auth.session().status === "anonymous") {
      <main
        class="flex h-dvh items-center justify-center bg-background p-6 text-foreground"
      >
        <section class="w-full max-w-sm">
          <div class="mb-8 flex items-center gap-3">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
            >
              Ix
            </span>
            <div>
              <h1 class="text-lg font-semibold tracking-tight">Imageryx</h1>
              <p class="text-sm text-muted-foreground">Personal dashboard</p>
            </div>
          </div>
          <button
            type="button"
            class="inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            (click)="signIn()"
          >
            Continue with DevAuth
          </button>
        </section>
      </main>
      <ix-toast-host />
    } @else {
      <div
        class="flex h-dvh overflow-hidden bg-background text-foreground"
        moveEnter="fade-up"
      >
        <volt-sidebar>
          <volt-sidebar-header>
            <a
              routerLink="/"
              class="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground"
              >
                Ix
              </span>
              @if (!sidebar.isCollapsed()) {
                <span>Imageryx</span>
              }
            </a>
          </volt-sidebar-header>

          <volt-sidebar-content>
            <volt-sidebar-group label="Workspace">
              <volt-sidebar-item routerLink="/" [exact]="true" label="Overview">
                <lmn-grid slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
              <volt-sidebar-item routerLink="/library" label="Library">
                <lmn-photo slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
              <volt-sidebar-item routerLink="/projects" label="Projects">
                <lmn-folder slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
              <volt-sidebar-item routerLink="/presets" label="Presets">
                <lmn-cog-6-tooth slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
              <volt-sidebar-item routerLink="/processing" label="Processing">
                <lmn-cpu-chip slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
              <volt-sidebar-item routerLink="/api" label="API">
                <lmn-code-bracket slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
              <volt-sidebar-item routerLink="/settings" label="Settings">
                <lmn-settings slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
            </volt-sidebar-group>

            <volt-sidebar-group label="Development">
              <volt-sidebar-item routerLink="/dev-flow" label="Dev Flow">
                <lmn-beaker slot="icon" [size]="16" tone="muted" />
              </volt-sidebar-item>
            </volt-sidebar-group>
          </volt-sidebar-content>

          <volt-sidebar-footer>
            <div class="flex items-center gap-2">
              <volt-avatar>
                <volt-avatar-fallback>{{
                  ownerInitials()
                }}</volt-avatar-fallback>
              </volt-avatar>
              @if (!sidebar.isCollapsed()) {
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-sm font-medium text-foreground">{{
                    ownerLabel()
                  }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{
                    ownerDetail()
                  }}</span>
                </div>
                <button
                  type="button"
                  class="ml-auto rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  (click)="signOut()"
                >
                  Sign out
                </button>
              }
            </div>
          </volt-sidebar-footer>
        </volt-sidebar>

        <div class="flex min-w-0 flex-1 flex-col">
          <ix-topbar />
          <main
            id="main-content"
            tabindex="-1"
            class="flex-1 overflow-y-auto p-4 sm:p-6"
          >
            <router-outlet />
          </main>
        </div>

        <ix-toast-host />
      </div>
    }
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthSessionService);
  protected readonly sidebar = inject(VoltSidebarService);
  private readonly viewport = inject(ViewportService);
  /** Injected eagerly so the persisted/preferred theme applies before first paint. */
  private readonly theme = inject(ThemeService);
  private readonly projects = inject(ProjectContextService);

  constructor() {
    effect(() => {
      this.sidebar.setCollapsed(this.viewport.isTablet());
    });

    void this.initializeSession();
  }

  protected signIn(): void {
    this.auth.startLogin("/");
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
  }

  protected ownerLabel(): string {
    const user = this.auth.user();
    return user?.name ?? user?.email ?? "Workspace owner";
  }

  protected ownerDetail(): string {
    return this.auth.user()?.email ?? "Signed in";
  }

  protected ownerInitials(): string {
    const label = this.ownerLabel();
    return label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
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
