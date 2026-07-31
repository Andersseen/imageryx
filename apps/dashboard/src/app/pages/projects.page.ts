import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ProjectSummary } from "@imageryx/sdk";
import { VoltBadge, VoltButton } from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnPencilSquareIcon,
  LmnPlusIcon,
  LmnTrashIcon,
} from "lumen-icons";
import { conflictCode, describeApiError } from "../core/api/api-error";
import { formatBytes, formatRelativeTime } from "../core/format/format";
import { NotificationService } from "../core/notifications/notification.service";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { EmptyState } from "../ui/empty-state.component";
import { ErrorState } from "../ui/error-state.component";
import { LoadingGrid } from "../ui/loading-grid.component";
import { PageHeader } from "../ui/page-header.component";
import { FoldersPanel } from "./projects/folders-panel.component";
import { ProjectFormDialog } from "./projects/project-form-dialog.component";
import { TagsPanel } from "./projects/tags-panel.component";

/**
 * Project management: create, edit, delete, and organise the selected project's folders and tags.
 *
 * The folders/tags panels operate on the *currently selected* project rather than on a per-card
 * expansion, so there is exactly one notion of "the project I am working in" across the whole
 * dashboard — the same one the topbar switcher and the library page use.
 */
@Component({
  selector: "ix-projects-page",
  standalone: true,
  imports: [
    RouterLink,
    VoltBadge,
    VoltButton,
    LmnArrowPathIcon,
    LmnPencilSquareIcon,
    LmnPlusIcon,
    LmnTrashIcon,
    EmptyState,
    ErrorState,
    LoadingGrid,
    PageHeader,
    FoldersPanel,
    ProjectFormDialog,
    TagsPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ix-page-header
        title="Projects"
        description="A project groups assets, folders, tags and presets, and owns the slug in every delivery URL."
      >
        <volt-button
          variant="outline"
          size="sm"
          [disabled]="context.projectsLoading()"
          (click)="reload()"
        >
          <lmn-arrow-path slot="leading" [size]="14" />
          Refresh
        </volt-button>
        <volt-button
          variant="solid"
          size="sm"
          (click)="openCreate()"
          data-testid="project-create"
        >
          <lmn-plus slot="leading" [size]="14" />
          New project
        </volt-button>
      </ix-page-header>

      @if (context.projectsLoading()) {
        <ix-loading-grid [count]="3" label="Loading projects…" />
      } @else if (context.projectsError(); as error) {
        <ix-error-state [error]="error" (retry)="reload()" />
      } @else if (context.hasNoProjects()) {
        <ix-empty-state
          title="No projects yet"
          description="Create your first project to start uploading and delivering images."
        >
          <volt-button variant="solid" size="sm" (click)="openCreate()"
            >New project</volt-button
          >
        </ix-empty-state>
      } @else {
        <ul
          class="grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4"
          data-testid="project-list"
        >
          @for (project of context.orderedProjects(); track project.id) {
            <li>
              <article
                class="flex h-full flex-col gap-3 rounded-lg border bg-card p-4"
                [class.border-primary]="
                  project.id === context.selectedProjectId()
                "
                [class.border-border]="
                  project.id !== context.selectedProjectId()
                "
                data-testid="project-card"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <h2 class="truncate text-sm font-semibold">
                      {{ project.name }}
                    </h2>
                    <p class="truncate font-mono text-xs text-muted-foreground">
                      {{ project.slug }}
                    </p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1">
                    @if (project.isDefault) {
                      <volt-badge variant="outline">Default</volt-badge>
                    }
                    @if (project.id === context.selectedProjectId()) {
                      <volt-badge variant="secondary">Selected</volt-badge>
                    }
                  </div>
                </div>

                @if (project.description) {
                  <p class="line-clamp-2 text-sm text-muted-foreground">
                    {{ project.description }}
                  </p>
                }

                <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div class="flex justify-between gap-2">
                    <dt class="text-muted-foreground">Assets</dt>
                    <dd class="font-medium">{{ project.assetCount }}</dd>
                  </div>
                  <div class="flex justify-between gap-2">
                    <dt class="text-muted-foreground">Folders</dt>
                    <dd class="font-medium">{{ project.folderCount }}</dd>
                  </div>
                  <div class="flex justify-between gap-2">
                    <dt class="text-muted-foreground">Presets</dt>
                    <dd class="font-medium">{{ project.presetCount }}</dd>
                  </div>
                  <div class="flex justify-between gap-2">
                    <dt class="text-muted-foreground">Originals</dt>
                    <dd class="font-medium">{{ storageLabel(project) }}</dd>
                  </div>
                </dl>

                <p class="text-xs text-muted-foreground">
                  @if (project.latestActivity; as activity) {
                    Last activity {{ activityLabel(activity.createdAt) }}
                  } @else {
                    No asset activity yet
                  }
                </p>

                <div
                  class="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
                >
                  @if (project.id === context.selectedProjectId()) {
                    <a routerLink="/library">
                      <volt-button variant="outline" size="sm"
                        >Open library</volt-button
                      >
                    </a>
                  } @else {
                    <volt-button
                      variant="outline"
                      size="sm"
                      (click)="context.select(project.id)"
                      data-testid="project-select"
                    >
                      Select
                      <span class="sr-only">{{ project.name }}</span>
                    </volt-button>
                  }
                  <volt-button
                    variant="ghost"
                    size="sm"
                    (click)="openEdit(project)"
                  >
                    <lmn-pencil-square slot="leading" [size]="14" />
                    <span class="sr-only">Edit {{ project.name }}</span>
                    <span aria-hidden="true">Edit</span>
                  </volt-button>
                  <volt-button
                    variant="ghost"
                    size="sm"
                    (click)="remove(project)"
                    data-testid="project-delete"
                  >
                    <lmn-trash slot="leading" [size]="14" />
                    <span class="sr-only">Delete {{ project.name }}</span>
                    <span aria-hidden="true">Delete</span>
                  </volt-button>
                </div>
              </article>
            </li>
          }
        </ul>

        @if (context.selectedProject(); as selected) {
          <div class="flex flex-col gap-2">
            <h2 class="text-lg font-semibold">
              Organising
              <span class="font-mono text-base">{{ selected.slug }}</span>
            </h2>
            <div class="grid gap-4 lg:grid-cols-2">
              <ix-folders-panel />
              <ix-tags-panel />
            </div>
          </div>
        }
      }

      <ix-project-form-dialog [project]="editing()" (saved)="onSaved($event)" />
    </div>
  `,
})
export default class ProjectsPage {
  protected readonly context = inject(ProjectContextService);
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly toasts = inject(NotificationService);

  private readonly formDialog = viewChild.required(ProjectFormDialog);
  protected readonly editing = signal<ProjectSummary | null>(null);

  protected readonly hasProjects = computed(
    () => this.context.projects().length > 0,
  );

  constructor() {
    void this.context.ensureLoaded();
  }

  protected async reload(): Promise<void> {
    await this.context.reloadProjects();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formDialog().open();
  }

  protected openEdit(project: ProjectSummary): void {
    this.editing.set(project);
    this.formDialog().open();
  }

  protected onSaved(project: ProjectSummary): void {
    const isNew = !this.editing();
    this.context.upsertProject(project);
    this.toasts.success(
      isNew ? "Project created" : "Project saved",
      isNew
        ? `Project "${project.name}" created.`
        : `Project "${project.name}" updated.`,
    );
    if (isNew) this.context.select(project.id);
    this.editing.set(null);
  }

  protected storageLabel(project: ProjectSummary): string {
    return formatBytes(project.totalOriginalBytes);
  }

  protected activityLabel(iso: string): string {
    return formatRelativeTime(iso);
  }

  /**
   * Deletes a project — genuinely destructive, unlike an asset's soft delete: the row and
   * everything under it (folders, tags, presets, assets, variants) is removed by a real database
   * cascade, and there is no restore.
   *
   * The dashboard never sends `cascade=true`. If the project still has active assets the API
   * refuses with a 409 naming the count, and that refusal is surfaced as-is rather than being
   * "helpfully" retried with the destructive flag set — deleting someone's assets because a
   * first attempt failed is not a decision a Delete button gets to make.
   */
  protected async remove(project: ProjectSummary): Promise<void> {
    const confirmed = globalThis.confirm(
      `Delete the project "${project.name}"?\n\nThis permanently removes its folders, tags and presets. It cannot be undone. Projects that still contain assets cannot be deleted here — delete the assets first.`,
    );
    if (!confirmed) return;

    try {
      await this.client.projects.delete(project.id);
      this.context.removeProject(project.id);
      this.toasts.success(
        "Project deleted",
        `Project "${project.name}" deleted.`,
      );
    } catch (error) {
      const info = describeApiError(error);
      if (conflictCode(error) === "project_has_active_assets") {
        this.toasts.warning("Project not empty", info.detail);
        return;
      }
      this.toasts.error(info.title, info.detail);
    }
  }
}
