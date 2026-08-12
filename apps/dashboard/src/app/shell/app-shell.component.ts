import { ChangeDetectionStrategy, Component, effect, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import {
  VoltSidebar,
  VoltSidebarContent,
  VoltSidebarFooter,
  VoltSidebarHeader,
  VoltSidebarService,
} from "@voltui/components";
import { MoveEnterDirective } from "angular-movement";
import { ViewportService } from "quartz-headless";
import { SidebarBrand } from "./sidebar-brand.component";
import { SidebarNav } from "./sidebar-nav.component";
import { SidebarUser } from "./sidebar-user.component";
import { Topbar } from "./topbar.component";

/**
 * The signed-in layout: sidebar rail, header row, and the routed page.
 *
 * Mounted only for an authenticated session, which is what lets the viewport-to-collapse effect
 * live here instead of on `AppComponent` — there is no sidebar to collapse until this component
 * exists, so tracking the breakpoint any earlier is work with no observer.
 *
 * `#main-content` and `tabindex="-1"` are the target of the skip link `AppComponent` renders;
 * the negative tabindex makes the `<main>` programmatically focusable without adding it to the
 * tab order.
 */
@Component({
  selector: "ix-app-shell",
  standalone: true,
  imports: [
    RouterOutlet,
    VoltSidebar,
    VoltSidebarContent,
    VoltSidebarFooter,
    VoltSidebarHeader,
    MoveEnterDirective,
    SidebarBrand,
    SidebarNav,
    SidebarUser,
    Topbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex h-dvh overflow-hidden bg-background text-foreground"
      moveEnter="fade-up"
    >
      <volt-sidebar>
        <volt-sidebar-header>
          <ix-sidebar-brand />
        </volt-sidebar-header>

        <volt-sidebar-content>
          <ix-sidebar-nav />
        </volt-sidebar-content>

        <volt-sidebar-footer>
          <ix-sidebar-user />
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
    </div>
  `,
})
export class AppShell {
  private readonly sidebar = inject(VoltSidebarService);
  private readonly viewport = inject(ViewportService);

  constructor() {
    effect(() => {
      this.sidebar.setCollapsed(this.viewport.isTablet());
    });
  }
}
