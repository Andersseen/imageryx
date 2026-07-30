import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VoltBadge, VoltButton, VoltSidebarService, VoltTooltip } from '@voltui/components';
import {
  LmnArrowUpTrayIcon,
  LmnChevronDownIcon,
  LmnMenuIcon,
  LmnMoonIcon,
  LmnSearchIcon,
  LmnSunIcon,
} from 'lumen-icons';
import { DASHBOARD_ENV } from '../core/env/dashboard-env.token';
import { ThemeService } from '../core/theme/theme.service';

/**
 * Header row: mobile nav trigger, project switcher / search placeholders
 * (disabled — Phase 4), environment badge, theme switcher, and the upload
 * button (disabled — Phase 4). Nothing here is clickable-but-inert without
 * also being visually and semantically disabled.
 */
@Component({
  selector: 'ix-topbar',
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    VoltTooltip,
    LmnArrowUpTrayIcon,
    LmnChevronDownIcon,
    LmnMenuIcon,
    LmnMoonIcon,
    LmnSearchIcon,
    LmnSunIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <volt-button variant="ghost" size="icon" class="md:hidden" (click)="sidebar.toggleMobile()">
        <span class="sr-only">Toggle navigation</span>
        <lmn-menu [size]="20" tone="muted" />
      </volt-button>

      <span voltTooltip="Project switching arrives in Phase 4" placement="bottom" class="hidden sm:inline-flex">
        <volt-button variant="outline" size="sm" [disabled]="true" aria-disabled="true">
          All Projects
          <lmn-chevron-down slot="trailing" [size]="14" tone="muted" />
        </volt-button>
      </span>

      <span voltTooltip="Search arrives in Phase 4" placement="bottom" class="hidden flex-1 max-w-sm md:inline-flex">
        <volt-button variant="outline" size="sm" [disabled]="true" aria-disabled="true" class="w-full justify-start">
          <lmn-search slot="leading" [size]="16" tone="muted" />
          <span class="text-muted-foreground">Search assets…</span>
        </volt-button>
      </span>

      <div class="flex-1"></div>

      <volt-badge variant="outline" class="hidden sm:inline-flex">{{ env.appEnv }}</volt-badge>

      <volt-button variant="ghost" size="icon" (click)="theme.toggle()">
        <span class="sr-only">{{ theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme' }}</span>
        @if (theme.isDark()) {
          <lmn-sun [size]="16" tone="muted" />
        } @else {
          <lmn-moon [size]="16" tone="muted" />
        }
      </volt-button>

      <span voltTooltip="Uploads arrive in Phase 4" placement="bottom">
        <volt-button variant="solid" size="sm" [disabled]="true" aria-disabled="true">
          <lmn-arrow-up-tray slot="leading" [size]="16" />
          Upload
        </volt-button>
      </span>
    </header>
  `,
})
export class Topbar {
  protected readonly env = inject(DASHBOARD_ENV);
  protected readonly theme = inject(ThemeService);
  protected readonly sidebar = inject(VoltSidebarService);
}
