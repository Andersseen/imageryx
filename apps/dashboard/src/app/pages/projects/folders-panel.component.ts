import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Folder } from "@imageryx/sdk";
import {
  VoltButton,
  VoltInput,
  VoltLabel,
  VoltNativeSelect,
} from "@voltui/components";
import { LmnFolderPlusIcon, LmnTrashIcon } from "lumen-icons";
import { NotificationService } from "../../core/notifications/notification.service";
import { describeApiError } from "../../core/api/api-error";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { EmptyState } from "../../ui/empty-state.component";

/**
 * Folder management for the selected project.
 *
 * Folders are a *logical* tree — renaming or deleting one never moves a byte in storage, because
 * storage keys are built from opaque ids, not paths (see ARCHITECTURE.md). The delete
 * confirmation says so explicitly, and names the real consequence instead: assets in the folder
 * are not deleted with it, they become root-level (`assets.folder_id` is `ON DELETE SET NULL`).
 */
@Component({
  selector: "ix-folders-panel",
  standalone: true,
  imports: [
    VoltButton,
    VoltInput,
    VoltLabel,
    VoltNativeSelect,
    LmnFolderPlusIcon,
    LmnTrashIcon,
    EmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-semibold">Folders</h2>
        <p class="text-sm text-muted-foreground">
          Folders organise asset paths. Renaming or deleting one never moves
          stored files.
        </p>
      </div>

      <form
        class="flex flex-col gap-3 sm:flex-row sm:items-end"
        (submit)="create($event)"
      >
        <div class="flex flex-1 flex-col gap-1.5">
          <volt-label htmlFor="new-folder-name">New folder name</volt-label>
          <volt-input
            id="new-folder-name"
            [value]="newName()"
            (valueChange)="newName.set($event)"
            placeholder="courses"
            data-testid="folder-name-input"
          />
        </div>
        <div class="flex flex-1 flex-col gap-1.5">
          <volt-label htmlFor="new-folder-parent">Parent</volt-label>
          <select voltNativeSelect
            id="new-folder-parent"
            (change)="parentId.set($any($event.target).value || null)"
          >
            <option value="">Project root</option>
            @for (folder of folders(); track folder.id) {
              <option [value]="folder.id">{{ folder.path }}</option>
            }
          </select>
        </div>
        <volt-button
          variant="solid"
          size="sm"
          type="submit"
          [disabled]="!canCreate()"
          data-testid="folder-create"
        >
          <lmn-folder-plus slot="leading" [size]="14" />
          Add folder
        </volt-button>
      </form>

      @if (folders().length === 0) {
        <ix-empty-state
          title="No folders"
          description="Every asset in this project sits at the project root."
        />
      } @else {
        <ul
          class="flex flex-col divide-y divide-border"
          data-testid="folder-list"
        >
          @for (folder of folders(); track folder.id) {
            <li class="flex items-center justify-between gap-3 py-2">
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-sm font-medium">{{
                  folder.name
                }}</span>
                <span class="truncate font-mono text-xs text-muted-foreground">
                  {{ folder.path }}
                </span>
              </span>
              <volt-button variant="ghost" size="sm" (click)="remove(folder)">
                <lmn-trash slot="leading" [size]="14" />
                <span class="sr-only">Delete folder {{ folder.path }}</span>
                <span aria-hidden="true">Delete</span>
              </volt-button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class FoldersPanel {
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly toasts = inject(NotificationService);
  protected readonly context = inject(ProjectContextService);

  protected readonly newName = signal("");
  protected readonly parentId = signal<string | null>(null);
  private readonly creating = signal(false);

  protected readonly folders = computed(() => this.context.folders());
  protected readonly canCreate = computed(
    () => this.newName().trim().length > 0 && !this.creating(),
  );

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    const projectId = this.context.selectedProjectId();
    const name = this.newName().trim();
    if (!projectId || name.length === 0 || this.creating()) return;

    this.creating.set(true);
    try {
      await this.client.folders.create(projectId, {
        name,
        parentId: this.parentId(),
      });
      this.newName.set("");
      await this.context.refreshProjectScopedData();
      this.toasts.success("Folder added", `Folder "${name}" created.`);
    } catch (error) {
      const info = describeApiError(error);
      this.toasts.error(info.title, info.detail);
    } finally {
      this.creating.set(false);
    }
  }

  protected async remove(folder: Folder): Promise<void> {
    const confirmed = globalThis.confirm(
      `Delete the folder "${folder.path}"?\n\nSubfolders are deleted with it. Assets inside are NOT deleted — they move to the project root, and their logical paths change accordingly.`,
    );
    if (!confirmed) return;

    try {
      await this.client.folders.delete(folder.id);
      await this.context.refreshProjectScopedData();
      this.toasts.success("Folder removed", `Folder "${folder.path}" deleted.`);
    } catch (error) {
      const info = describeApiError(error);
      this.toasts.error(info.title, info.detail);
    }
  }
}
