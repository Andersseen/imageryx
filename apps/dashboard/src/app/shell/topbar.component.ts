import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { VoltBadge, VoltButton, VoltSidebarService } from "@voltui/components";
import { LmnMenuIcon, LmnMoonIcon, LmnSunIcon } from "lumen-icons";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { ThemeService } from "../core/theme/theme.service";
import { GlobalSearch } from "./global-search.component";
import { ProjectSwitcher } from "./project-switcher.component";
import { UploadDialog } from "./upload-dialog.component";

/**
 * Header row: mobile nav trigger, project switcher, asset search, environment badge, theme
 * switcher, and upload.
 *
 * All three of the project switcher, search box and upload button were disabled Phase 1
 * placeholders; as of Phase 4A they are real. The upload button is the only control that can
 * still be disabled, and only for an honest reason — there is no project selected to upload
 * into.
 */
@Component({
  selector: "ix-topbar",
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    LmnMenuIcon,
    LmnMoonIcon,
    LmnSunIcon,
    GlobalSearch,
    ProjectSwitcher,
    UploadDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4"
    >
      <volt-button
        variant="ghost"
        size="icon"
        class="md:hidden"
        (click)="sidebar.toggleMobile()"
      >
        <span class="sr-only">Toggle navigation</span>
        <lmn-menu [size]="20" tone="muted" />
      </volt-button>

      <div class="hidden sm:flex">
        <ix-project-switcher />
      </div>

      <div class="hidden max-w-sm flex-1 md:flex">
        <ix-global-search />
      </div>

      <div class="flex-1"></div>

      <volt-badge variant="outline" class="hidden sm:inline-flex">{{
        env.appEnv
      }}</volt-badge>

      <volt-button variant="ghost" size="icon" (click)="theme.toggle()">
        <span class="sr-only">{{
          theme.isDark() ? "Switch to light theme" : "Switch to dark theme"
        }}</span>
        @if (theme.isDark()) {
          <lmn-sun [size]="16" tone="muted" />
        } @else {
          <lmn-moon [size]="16" tone="muted" />
        }
      </volt-button>

      <ix-upload-dialog />
    </header>
  `,
})
export class Topbar {
  protected readonly env = inject(DASHBOARD_ENV);
  protected readonly theme = inject(ThemeService);
  protected readonly sidebar = inject(VoltSidebarService);
}
