import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ImagePreset } from "@imageryx/sdk";
import { VoltBadge, VoltButton } from "@voltui/components";
import {
  LmnDocumentDuplicateIcon,
  LmnPencilSquareIcon,
  LmnPlusIcon,
  LmnTrashIcon,
} from "lumen-icons";
import { describeApiError } from "../../core/api/api-error";
import { AsyncStore } from "../../core/api/async-store";
import { formatDateTime } from "../../core/format/format";
import { NotificationService } from "../../core/notifications/notification.service";
import {
  summarizeOperations,
  summarizePresetOutput,
} from "../../core/presets/preset-operations";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { EmptyState } from "../../ui/empty-state.component";
import { ErrorState } from "../../ui/error-state.component";
import { LoadingGrid } from "../../ui/loading-grid.component";
import { PageHeader } from "../../ui/page-header.component";

/**
 * Every real preset for the selected project, split into the system set (read-only, seeded per
 * project — see context.md's "System presets are always project-scoped") and custom presets the
 * user created. `/presets/:presetId` doubles as both the viewer for a system preset and the
 * editor for a custom one, rather than two separate routes for what is otherwise the same page.
 */
@Component({
  selector: "ix-presets-page",
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    VoltBadge,
    VoltButton,
    LmnDocumentDuplicateIcon,
    LmnPencilSquareIcon,
    LmnPlusIcon,
    LmnTrashIcon,
    EmptyState,
    ErrorState,
    LoadingGrid,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <ix-page-header
        title="Presets"
        description="Named transformation recipes, reusable across every asset in this project."
      >
        <a routerLink="/presets/new">
          <volt-button
            variant="solid"
            size="sm"
            [disabled]="!context.selectedProjectId()"
            data-testid="preset-create"
          >
            <lmn-plus slot="leading" [size]="14" />
            New preset
          </volt-button>
        </a>
      </ix-page-header>

      @if (!context.selectedProjectId()) {
        <ix-empty-state
          title="No project selected"
          description="Presets live inside a project. Select one from the topbar to see its presets."
        />
      } @else if (presets.isLoading()) {
        <ix-loading-grid [count]="6" label="Loading presets…" />
      } @else if (presets.error(); as error) {
        <ix-error-state [error]="error" (retry)="reload()" />
      } @else {
        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold text-muted-foreground">
            System presets
          </h2>
          @if (systemPresets().length === 0) {
            <p class="text-sm text-muted-foreground">None for this project.</p>
          } @else {
            <ul
              class="grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
              data-testid="system-preset-list"
            >
              @for (preset of systemPresets(); track preset.id) {
                <li>
                  <ng-container
                    [ngTemplateOutlet]="card"
                    [ngTemplateOutletContext]="{ preset }"
                  />
                </li>
              }
            </ul>
          }
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-semibold text-muted-foreground">
            Custom presets
          </h2>
          @if (customPresets().length === 0) {
            <ix-empty-state
              title="No custom presets yet"
              description="Create one, or duplicate a system preset to start from."
            >
              <a routerLink="/presets/new">
                <volt-button variant="outline" size="sm"
                  >New preset</volt-button
                >
              </a>
            </ix-empty-state>
          } @else {
            <ul
              class="grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
              data-testid="custom-preset-list"
            >
              @for (preset of customPresets(); track preset.id) {
                <li>
                  <ng-container
                    [ngTemplateOutlet]="card"
                    [ngTemplateOutletContext]="{ preset }"
                  />
                </li>
              }
            </ul>
          }
        </section>
      }
    </div>

    <ng-template #card let-preset="preset">
      <article
        class="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4"
        data-testid="preset-card"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 flex-col">
            <h3 class="truncate text-sm font-medium">{{ preset.name }}</h3>
            <p class="truncate font-mono text-xs text-muted-foreground">
              {{ preset.slug }}
            </p>
          </div>
          <volt-badge [variant]="preset.isSystem ? 'outline' : 'secondary'">
            {{ preset.isSystem ? "System" : "Custom" }}
          </volt-badge>
        </div>

        <p class="text-xs text-muted-foreground">{{ outputSummary(preset) }}</p>
        <p class="line-clamp-2 text-xs text-muted-foreground">
          {{ operationsSummary(preset) }}
        </p>
        <p class="text-xs text-muted-foreground">
          Updated {{ updatedLabel(preset) }}
        </p>

        <div
          class="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
        >
          <a [routerLink]="['/presets', preset.id]">
            <volt-button variant="outline" size="sm">
              @if (preset.isSystem) {
                View
              } @else {
                <lmn-pencil-square slot="leading" [size]="14" />
                Edit
              }
            </volt-button>
          </a>
          <volt-button
            variant="ghost"
            size="sm"
            (click)="duplicate(preset)"
            data-testid="preset-duplicate"
          >
            <lmn-document-duplicate slot="leading" [size]="14" />
            Duplicate
          </volt-button>
          @if (!preset.isSystem) {
            <volt-button
              variant="ghost"
              size="sm"
              (click)="remove(preset)"
              data-testid="preset-delete"
            >
              <lmn-trash slot="leading" [size]="14" />
              Delete
            </volt-button>
          }
        </div>
      </article>
    </ng-template>
  `,
})
export default class PresetsPage {
  protected readonly context = inject(ProjectContextService);
  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly notifications = inject(NotificationService);

  protected readonly presets = new AsyncStore<ImagePreset[]>();

  protected readonly systemPresets = computed(() =>
    (this.presets.data() ?? []).filter((p) => p.isSystem),
  );
  protected readonly customPresets = computed(() =>
    (this.presets.data() ?? []).filter((p) => !p.isSystem),
  );

  private lastProjectId: string | null = null;

  constructor() {
    void this.context.ensureLoaded();

    effect(() => {
      const projectId = this.context.selectedProjectId();
      if (projectId === this.lastProjectId) return;
      this.lastProjectId = projectId;
      if (!projectId) {
        untracked(() => this.presets.reset());
        return;
      }
      untracked(() => void this.fetch(projectId));
    });
  }

  private async fetch(projectId: string): Promise<void> {
    await this.presets.load(
      async () => (await this.client.presets.list(projectId)).items,
    );
  }

  protected async reload(): Promise<void> {
    const projectId = this.context.selectedProjectId();
    if (projectId) await this.fetch(projectId);
  }

  protected outputSummary(preset: ImagePreset): string {
    return summarizePresetOutput(preset.outputFormat, preset.quality);
  }

  protected operationsSummary(preset: ImagePreset): string {
    return summarizeOperations(preset.operations);
  }

  protected updatedLabel(preset: ImagePreset): string {
    return formatDateTime(preset.updatedAt);
  }

  protected async duplicate(preset: ImagePreset): Promise<void> {
    const projectId = this.context.selectedProjectId();
    if (!projectId) return;
    try {
      const created = await this.client.presets.create({
        projectId,
        name: `${preset.name} (copy)`,
        operations: preset.operations,
        outputFormat: preset.outputFormat,
        quality: preset.quality ?? undefined,
      });
      this.notifications.success(
        "Preset duplicated",
        `"${created.name}" created — open it to customize.`,
      );
      await this.reload();
    } catch (error) {
      const info = describeApiError(error);
      this.notifications.error(info.title, info.detail);
    }
  }

  protected async remove(preset: ImagePreset): Promise<void> {
    const confirmed = globalThis.confirm(
      `Delete the preset "${preset.name}"?\n\nThis cannot be undone. Variants already generated from it are not affected.`,
    );
    if (!confirmed) return;

    try {
      await this.client.presets.delete(preset.id);
      this.notifications.success("Preset deleted", `"${preset.name}" deleted.`);
      await this.reload();
    } catch (error) {
      const info = describeApiError(error);
      this.notifications.error(info.title, info.detail);
    }
  }
}
