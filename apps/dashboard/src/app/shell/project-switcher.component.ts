import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import {
  VoltBadge,
  VoltButton,
  VoltDropdownMenu,
  VoltDropdownMenuItem,
  VoltDropdownMenuTrigger,
} from "@voltui/components";
import { LmnCheckIcon, LmnChevronDownIcon, LmnFolderIcon } from "lumen-icons";
import { formatCount } from "../core/format/format";
import { ProjectContextService } from "../core/projects/project-context.service";

/**
 * Switches the project every other screen is scoped to.
 *
 * Renders one of four honest states rather than a disabled control: loading, failed to load,
 * no projects at all, or a real menu. In particular "no projects" is not an error — it is what
 * a fresh install looks like — so it points at /projects instead of showing a broken picker.
 */
@Component({
  selector: "ix-project-switcher",
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    VoltDropdownMenu,
    VoltDropdownMenuItem,
    VoltDropdownMenuTrigger,
    LmnCheckIcon,
    LmnChevronDownIcon,
    LmnFolderIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (context.projectsLoading()) {
      <span class="text-sm text-muted-foreground" role="status"
        >Loading projects…</span
      >
    } @else if (context.projectsError(); as error) {
      <span class="text-sm text-destructive" role="alert">{{
        error.title
      }}</span>
    } @else if (context.hasNoProjects()) {
      <volt-badge variant="outline">No projects yet</volt-badge>
    } @else {
      <volt-button
        variant="outline"
        size="sm"
        [voltDropdownMenu]="projectMenu"
        placement="bottom-start"
        data-testid="project-switcher-trigger"
      >
        <lmn-folder slot="leading" [size]="14" tone="muted" />
        <span class="max-w-[10rem] truncate">{{ triggerLabel() }}</span>
        <lmn-chevron-down slot="trailing" [size]="14" tone="muted" />
      </volt-button>

      <ng-template #projectMenu>
        <volt-dropdown-menu class="min-w-[16rem]">
          @for (project of context.orderedProjects(); track project.id) {
            <volt-dropdown-menu-item
              (click)="context.select(project.id)"
              [attr.aria-current]="
                project.id === context.selectedProjectId() ? 'true' : null
              "
              data-testid="project-switcher-option"
            >
              <span class="flex w-full items-center gap-2">
                <span class="flex w-4 shrink-0 justify-center">
                  @if (project.id === context.selectedProjectId()) {
                    <lmn-check [size]="14" />
                  }
                </span>
                <span class="flex min-w-0 flex-1 flex-col text-left">
                  <span class="truncate text-sm">{{ project.name }}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {{ project.slug }} ·
                    {{ assetCountLabel(project.assetCount) }}
                  </span>
                </span>
                @if (project.isDefault) {
                  <volt-badge variant="outline">Default</volt-badge>
                }
              </span>
            </volt-dropdown-menu-item>
          }
        </volt-dropdown-menu>
      </ng-template>
    }
  `,
})
export class ProjectSwitcher {
  protected readonly context = inject(ProjectContextService);

  protected readonly triggerLabel = computed(
    () => this.context.selectedProject()?.name ?? "Select a project",
  );

  protected assetCountLabel(count: number): string {
    return formatCount(count, "asset");
  }
}
