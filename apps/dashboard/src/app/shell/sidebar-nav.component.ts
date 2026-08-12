import { ChangeDetectionStrategy, Component } from "@angular/core";
import {
  VoltSidebarGroup,
  VoltSidebarItem,
} from "@voltui/components";
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

/**
 * Every navigation destination in the app, in one place.
 *
 * Written out rather than driven by a config array: each row needs its own icon *component*
 * tag, so a `@for` would have to go through `NgComponentOutlet` and lose the compile-time check
 * that the icon actually exists. Eight explicit rows are cheaper to read than that indirection.
 *
 * "Development" is a separate group because `/dev-flow` is a diagnostic surface, not part of
 * the normal workspace task flow.
 */
@Component({
  selector: "ix-sidebar-nav",
  standalone: true,
  imports: [
    VoltSidebarGroup,
    VoltSidebarItem,
    LmnBeakerIcon,
    LmnCodeBracketIcon,
    LmnCog6ToothIcon,
    LmnCpuChipIcon,
    LmnFolderIcon,
    LmnGridIcon,
    LmnPhotoIcon,
    LmnSettingsIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
  `,
})
export class SidebarNav {}
