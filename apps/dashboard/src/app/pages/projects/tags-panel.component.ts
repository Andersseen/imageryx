import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  VoltBadge,
  VoltButton,
  VoltInput,
  VoltLabel,
} from "@voltui/components";
import { LmnPlusIcon } from "lumen-icons";
import { NotificationService } from "../../core/notifications/notification.service";
import { describeApiError } from "../../core/api/api-error";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";

/**
 * Tag management for the selected project.
 *
 * Creation only. Renaming and deleting a tag exist in the API, but both need to say what happens
 * to the assets currently carrying it, and that belongs with the asset workspace in Phase 4B —
 * shipping a Delete button here without that answer would be shipping a control whose
 * consequences the UI cannot explain.
 */
@Component({
  selector: "ix-tags-panel",
  standalone: true,
  imports: [VoltBadge, VoltButton, VoltInput, VoltLabel, LmnPlusIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-semibold">Tags</h2>
        <p class="text-sm text-muted-foreground">
          Tags are project-scoped labels you can filter the library by.
        </p>
      </div>

      <form
        class="flex flex-col gap-3 sm:flex-row sm:items-end"
        (submit)="create($event)"
      >
        <div class="flex flex-1 flex-col gap-1.5">
          <volt-label htmlFor="new-tag-name">New tag</volt-label>
          <volt-input
            id="new-tag-name"
            [value]="newName()"
            (valueChange)="newName.set($event)"
            placeholder="marketing"
            data-testid="tag-name-input"
          />
        </div>
        <volt-button
          variant="solid"
          size="sm"
          type="submit"
          [disabled]="!canCreate()"
          data-testid="tag-create"
        >
          <lmn-plus slot="leading" [size]="14" />
          Add tag
        </volt-button>
      </form>

      @if (tags().length === 0) {
        <p class="text-sm text-muted-foreground">
          No tags in this project yet.
        </p>
      } @else {
        <ul class="flex flex-wrap gap-2" data-testid="tag-list">
          @for (tag of tags(); track tag) {
            <li>
              <volt-badge variant="secondary">{{ tag }}</volt-badge>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class TagsPanel {
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly toasts = inject(NotificationService);
  protected readonly context = inject(ProjectContextService);

  protected readonly newName = signal("");
  private readonly creating = signal(false);

  protected readonly tags = computed(() => this.context.tags());
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
      await this.client.tags.create(projectId, name);
      this.newName.set("");
      await this.context.refreshProjectScopedData();
      this.toasts.success("Tag added", `Tag "${name}" created.`);
    } catch (error) {
      const info = describeApiError(error);
      this.toasts.error(info.title, info.detail);
    } finally {
      this.creating.set(false);
    }
  }
}
