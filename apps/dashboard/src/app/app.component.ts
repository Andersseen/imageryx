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
              <volt-avatar-fallback>A</volt-avatar-fallback>
            </volt-avatar>
            @if (!sidebar.isCollapsed()) {
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-sm font-medium text-foreground"
                  >Andrii</span
                >
                <span class="truncate text-xs text-muted-foreground"
                  >Workspace owner</span
                >
              </div>
            }
          </div>
        </volt-sidebar-footer>
      </volt-sidebar>

      <div class="flex min-w-0 flex-1 flex-col">
        <ix-topbar />
        <main class="flex-1 overflow-y-auto p-4 sm:p-6">
          <router-outlet />
        </main>
      </div>

      <ix-toast-host />
    </div>
  `,
})
export class AppComponent {
  protected readonly sidebar = inject(VoltSidebarService);
  private readonly viewport = inject(ViewportService);
  /** Injected eagerly so the persisted/preferred theme applies before first paint. */
  private readonly theme = inject(ThemeService);
  private readonly projects = inject(ProjectContextService);

  constructor() {
    effect(() => {
      this.sidebar.setCollapsed(this.viewport.isTablet());
    });

    // Loaded once here rather than per route: the topbar's project switcher is always mounted,
    // and every project-scoped page would otherwise race to fetch the same list on activation.
    void this.projects.ensureLoaded();
  }
}
