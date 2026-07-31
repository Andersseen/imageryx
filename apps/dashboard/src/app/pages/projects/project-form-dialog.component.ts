import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  type TemplateRef,
  viewChild,
} from "@angular/core";
import type { ProjectSummary } from "@imageryx/sdk";
import {
  VoltButton,
  VoltError,
  VoltHint,
  VoltInput,
  VoltLabel,
  VoltSwitch,
  VoltTextarea,
} from "@voltui/components";
import { LmnXMarkIcon } from "lumen-icons";
import { describeApiError, type ApiErrorInfo } from "../../core/api/api-error";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { ModalController } from "../../ui/modal";
import {
  slugify,
  validateProjectForm,
  type ProjectFormErrors,
} from "./project-form";

/**
 * Create-or-edit form for a project, in a dialog.
 *
 * One component covers both because the fields are the same and only the submit call differs;
 * two near-identical dialogs would drift. In edit mode the slug is shown but not editable — the
 * API has no slug-update path, and a project slug appears in every public delivery URL for that
 * project, so silently offering to change it would be offering to break live links.
 */
@Component({
  selector: "ix-project-form-dialog",
  standalone: true,
  imports: [
    VoltButton,
    VoltError,
    VoltHint,
    VoltInput,
    VoltLabel,
    VoltSwitch,
    VoltTextarea,
    LmnXMarkIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #dialogTemplate>
      <form
        class="flex max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        (submit)="submit($event)"
        data-testid="project-form-dialog"
      >
        <div
          class="flex items-start justify-between gap-4 border-b border-border p-4"
        >
          <h2 [id]="titleId" class="text-base font-semibold">
            {{ isEdit() ? "Edit project" : "New project" }}
          </h2>
          <volt-button
            variant="ghost"
            size="icon"
            type="button"
            (click)="close()"
          >
            <span class="sr-only">Close</span>
            <lmn-x-mark [size]="16" />
          </volt-button>
        </div>

        <div class="flex flex-col gap-4 overflow-y-auto p-4">
          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="project-name" [error]="!!errors().name"
              >Name</volt-label
            >
            <volt-input
              id="project-name"
              [value]="name()"
              (valueChange)="onNameChange($event)"
              [attr.aria-invalid]="errors().name ? 'true' : null"
              [attr.aria-describedby]="errors().name ? nameErrorId : null"
              data-testid="project-name-input"
            />
            @if (errors().name; as message) {
              <volt-error [id]="nameErrorId">{{ message }}</volt-error>
            }
          </div>

          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="project-slug" [error]="!!errors().slug"
              >Slug</volt-label
            >
            <volt-input
              id="project-slug"
              [value]="slug()"
              [readonly]="isEdit()"
              (valueChange)="onSlugChange($event)"
              [attr.aria-invalid]="errors().slug ? 'true' : null"
              [attr.aria-describedby]="errors().slug ? slugErrorId : slugHintId"
              data-testid="project-slug-input"
            />
            @if (errors().slug; as message) {
              <volt-error [id]="slugErrorId">{{ message }}</volt-error>
            } @else {
              <volt-hint [id]="slugHintId">
                @if (isEdit()) {
                  The slug appears in every delivery URL for this project and
                  cannot be changed here.
                } @else {
                  Lowercase letters, digits and hyphens. Used in every delivery
                  URL for this project.
                }
              </volt-hint>
            }
          </div>

          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="project-description">Description</volt-label>
            <volt-textarea
              id="project-description"
              [rows]="3"
              [value]="description()"
              (valueChange)="description.set($event)"
            />
          </div>

          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="text-sm font-medium">Default project</span>
              <span class="text-xs text-muted-foreground">
                Pre-selected in the project switcher on a fresh session.
              </span>
            </div>
            <volt-switch
              [checked]="isDefault()"
              (checkedChange)="isDefault.set($event)"
            />
          </div>

          @if (!isEdit()) {
            <div class="flex items-center justify-between gap-4">
              <div class="flex flex-col">
                <span class="text-sm font-medium">Add system presets</span>
                <span class="text-xs text-muted-foreground">
                  Creates the standard Thumbnail, Avatar, Content, Hero, Project
                  Card and Download High presets.
                </span>
              </div>
              <volt-switch
                [checked]="withSystemPresets()"
                (checkedChange)="withSystemPresets.set($event)"
              />
            </div>
          }

          @if (submitError(); as error) {
            <p class="text-sm text-destructive" role="alert">
              {{ error.detail }}
            </p>
          }
        </div>

        <div
          class="flex items-center justify-end gap-2 border-t border-border p-4"
        >
          <volt-button
            variant="outline"
            size="sm"
            type="button"
            (click)="close()"
          >
            Cancel
          </volt-button>
          <volt-button
            variant="solid"
            size="sm"
            type="submit"
            [disabled]="saving()"
            data-testid="project-form-submit"
          >
            {{
              saving()
                ? "Saving…"
                : isEdit()
                  ? "Save changes"
                  : "Create project"
            }}
          </volt-button>
        </div>
      </form>
    </ng-template>
  `,
})
export class ProjectFormDialog {
  /** `null` opens the dialog in create mode. */
  readonly project = input<ProjectSummary | null>(null);
  readonly saved = output<ProjectSummary>();

  private readonly client = inject(IMAGERYX_CLIENT);
  private readonly modal = new ModalController();
  private readonly dialogTemplate =
    viewChild.required<TemplateRef<unknown>>("dialogTemplate");

  protected readonly titleId = "project-form-title";
  protected readonly nameErrorId = "project-name-error";
  protected readonly slugErrorId = "project-slug-error";
  protected readonly slugHintId = "project-slug-hint";

  protected readonly name = signal("");
  protected readonly slug = signal("");
  protected readonly description = signal("");
  protected readonly isDefault = signal(false);
  protected readonly withSystemPresets = signal(true);

  protected readonly saving = signal(false);
  protected readonly submitError = signal<ApiErrorInfo | null>(null);
  /** Validation messages are withheld until submit, so typing a name does not flash an error mid-word. */
  protected readonly submitted = signal(false);
  /** Once the slug has been typed by hand, it stops tracking the name. */
  private slugTouched = false;

  protected readonly isEdit = computed(() => this.project() !== null);

  protected readonly errors = computed<ProjectFormErrors>(() =>
    this.submitted()
      ? validateProjectForm(
          { name: this.name(), slug: this.slug() },
          { requireSlug: !this.isEdit() },
        )
      : {},
  );

  constructor() {
    effect(() => {
      const project = this.project();
      this.name.set(project?.name ?? "");
      this.slug.set(project?.slug ?? "");
      this.description.set(project?.description ?? "");
      this.isDefault.set(project?.isDefault ?? false);
      this.slugTouched = project !== null;
    });
  }

  open(): void {
    this.submitted.set(false);
    this.submitError.set(null);
    this.modal.open(this.dialogTemplate());
  }

  close(): void {
    this.modal.close();
  }

  protected onNameChange(value: string): void {
    this.name.set(value);
    // Auto-fills the slug while creating, until the user takes it over.
    if (!this.slugTouched && !this.isEdit()) this.slug.set(slugify(value));
  }

  protected onSlugChange(value: string): void {
    this.slugTouched = true;
    this.slug.set(value);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    this.submitError.set(null);

    if (Object.keys(this.errors()).length > 0) {
      document
        .getElementById(this.errors().name ? "project-name" : "project-slug")
        ?.focus();
      return;
    }

    this.saving.set(true);
    try {
      const existing = this.project();
      const saved = existing
        ? await this.client.projects.update(existing.id, {
            name: this.name().trim(),
            description: this.description().trim() || null,
            isDefault: this.isDefault(),
          })
        : await this.client.projects.create({
            name: this.name().trim(),
            slug: this.slug().trim(),
            description: this.description().trim() || null,
            isDefault: this.isDefault(),
            withSystemPresets: this.withSystemPresets(),
          });

      // `update` returns a bare Project while `create` returns one too — neither carries the
      // aggregate counts, so they are carried over from the existing row rather than invented.
      this.saved.emit({
        ...(existing ?? {
          assetCount: 0,
          folderCount: 0,
          presetCount: 0,
          totalOriginalBytes: 0,
          latestActivity: null,
        }),
        ...saved,
      } as ProjectSummary);
      this.close();
    } catch (error) {
      this.submitError.set(describeApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
