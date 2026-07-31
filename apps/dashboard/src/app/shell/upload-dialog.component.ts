import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type TemplateRef,
  viewChild,
} from "@angular/core";
import {
  VoltBadge,
  VoltButton,
  VoltFileDropzone,
  VoltInput,
  VoltLabel,
  VoltNativeSelect,
  VoltSwitch,
} from "@voltui/components";
import {
  LmnArrowUpTrayIcon,
  LmnCheckCircleIcon,
  LmnCloudArrowUpIcon,
  LmnExclamationCircleIcon,
  LmnXMarkIcon,
} from "lumen-icons";
import { NotificationService } from "../core/notifications/notification.service";
import { formatBytes } from "../core/format/format";
import { parseTags } from "../core/format/tags";
import { ProjectContextService } from "../core/projects/project-context.service";
import { UploadService } from "../core/uploads/upload.service";
import { ModalController } from "../ui/modal";

/** Mirrors the supported MIME types in `@imageryx/contracts` — the API rejects anything else. */
const ACCEPTED_TYPES =
  "image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml";

/**
 * The dashboard's upload entry point: pick files, choose where they land, and watch each one
 * through upload → processing → ready.
 *
 * Dialog behaviour comes from Quartz's `DialogService` (focus containment, Escape, backdrop) and
 * the look from Volt — the documented split in context.md. The trigger button is a real
 * `<volt-button>` in this component's own template so focus returns to it on close, which
 * `DialogService` does not do for a detached trigger.
 */
@Component({
  selector: "ix-upload-dialog",
  standalone: true,
  imports: [
    VoltBadge,
    VoltButton,
    VoltFileDropzone,
    VoltInput,
    VoltLabel,
    VoltNativeSelect,
    VoltSwitch,
    LmnArrowUpTrayIcon,
    LmnCheckCircleIcon,
    LmnCloudArrowUpIcon,
    LmnExclamationCircleIcon,
    LmnXMarkIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <volt-button
      variant="solid"
      size="sm"
      [disabled]="!context.selectedProjectId()"
      (click)="open()"
      data-testid="upload-trigger"
    >
      <lmn-arrow-up-tray slot="leading" [size]="16" />
      Upload
    </volt-button>

    <ng-template #dialogTemplate>
      <div
        class="flex max-h-[85vh] w-[min(38rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
        data-testid="upload-dialog"
      >
        <div
          class="flex items-start justify-between gap-4 border-b border-border p-4"
        >
          <div class="flex flex-col gap-1">
            <h2 id="upload-dialog-title" class="text-base font-semibold">
              Upload images
            </h2>
            <p class="text-sm text-muted-foreground">
              Uploading to
              <strong>{{ context.selectedProject()?.name }}</strong>
            </p>
          </div>
          <volt-button variant="ghost" size="icon" (click)="close()">
            <span class="sr-only">Close upload dialog</span>
            <lmn-x-mark [size]="16" />
          </volt-button>
        </div>

        <div class="flex flex-col gap-4 overflow-y-auto p-4">
          <volt-file-dropzone
            [fileTypes]="acceptedTypes"
            [multiple]="true"
            [disabled]="uploads.isUploading()"
            (selected)="onFilesSelected($event)"
            class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
            data-testid="upload-dropzone"
          >
            <lmn-cloud-arrow-up [size]="32" tone="muted" />
            <p class="text-sm font-medium">Drop images here, or choose files</p>
            <p class="text-xs text-muted-foreground">
              PNG, JPEG, WebP, AVIF, GIF or SVG · up to
              {{ maxUploadLabel }} each
            </p>
          </volt-file-dropzone>

          <!--
            A real <input type="file"> alongside the dropzone: the dropzone is a div-based drag
            target, and a keyboard-only user needs a native control to reach the file picker.
          -->
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Choose files</span>
            <input
              type="file"
              multiple
              [accept]="acceptedTypes"
              [disabled]="uploads.isUploading()"
              class="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              (change)="onFileInput($event)"
              data-testid="upload-file-input"
            />
          </label>

          @if (selectedFiles().length > 0) {
            <p
              class="text-sm text-muted-foreground"
              data-testid="upload-selection-summary"
            >
              {{ selectedFiles().length }} file(s) selected ·
              {{ totalSizeLabel() }}
            </p>
          }

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <volt-label htmlFor="upload-folder">Folder</volt-label>
              <volt-native-select
                id="upload-folder"
                [disabled]="uploads.isUploading()"
                (change)="folderId.set($any($event.target).value || null)"
              >
                <option value="">Project root</option>
                @for (folder of context.folders(); track folder.id) {
                  <option
                    [value]="folder.id"
                    [selected]="folder.id === folderId()"
                  >
                    {{ folder.path }}
                  </option>
                }
              </volt-native-select>
            </div>

            <div class="flex flex-col gap-1.5">
              <volt-label htmlFor="upload-visibility">Visibility</volt-label>
              <volt-native-select
                id="upload-visibility"
                [disabled]="uploads.isUploading()"
                (change)="visibility.set($any($event.target).value)"
              >
                <option value="public" [selected]="visibility() === 'public'">
                  Public — served at a delivery URL
                </option>
                <option value="private" [selected]="visibility() === 'private'">
                  Private — signed links only
                </option>
              </volt-native-select>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <volt-label htmlFor="upload-tags">Tags</volt-label>
            <volt-input
              id="upload-tags"
              placeholder="hero, marketing"
              [value]="tagsInput()"
              [disabled]="uploads.isUploading()"
              (valueChange)="tagsInput.set($event)"
            />
            <p class="text-xs text-muted-foreground">
              Comma-separated. Applied to every file.
            </p>
          </div>

          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col">
              <span class="text-sm font-medium">Allow original downloads</span>
              <span class="text-xs text-muted-foreground">
                Controls whether a signed download link can serve the original
                file.
              </span>
            </div>
            <volt-switch
              [checked]="downloadOriginalEnabled()"
              [disabled]="uploads.isUploading()"
              (checkedChange)="downloadOriginalEnabled.set($event)"
            />
          </div>

          @if (uploads.queue().length > 0) {
            <div class="flex flex-col gap-2 border-t border-border pt-4">
              <h3 class="text-sm font-medium">Progress</h3>
              <ul class="flex flex-col gap-1.5" data-testid="upload-queue">
                @for (item of uploads.queue(); track item.id) {
                  <li
                    class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span class="min-w-0 flex-1 truncate text-sm">{{
                      item.fileName
                    }}</span>
                    <span class="flex shrink-0 items-center gap-2">
                      @switch (item.status) {
                        @case ("ready") {
                          <lmn-check-circle [size]="14" />
                          <volt-badge variant="secondary">Ready</volt-badge>
                        }
                        @case ("failed") {
                          <lmn-exclamation-circle [size]="14" />
                          <volt-badge variant="destructive">Failed</volt-badge>
                        }
                        @case ("processing") {
                          <volt-badge variant="outline">Processing</volt-badge>
                        }
                        @case ("uploading") {
                          <volt-badge variant="outline">Uploading</volt-badge>
                        }
                        @default {
                          <volt-badge variant="outline">Queued</volt-badge>
                        }
                      }
                    </span>
                  </li>
                  @if (item.error) {
                    <li class="px-3 text-xs text-destructive">
                      {{ item.error.detail }}
                    </li>
                  }
                  @if (item.duplicateOfPath) {
                    <li class="px-3 text-xs text-muted-foreground">
                      An asset with identical content already exists at
                      <code>{{ item.duplicateOfPath }}</code
                      >. This upload was still stored as a separate asset.
                    </li>
                  }
                  @for (warning of item.securityWarnings; track warning) {
                    <li class="px-3 text-xs text-muted-foreground">
                      {{ warning }}
                    </li>
                  }
                }
              </ul>
            </div>
          }
        </div>

        <div
          class="flex items-center justify-end gap-2 border-t border-border p-4"
        >
          <volt-button
            variant="outline"
            size="sm"
            (click)="close()"
            data-testid="upload-close"
          >
            Close
          </volt-button>
          <volt-button
            variant="solid"
            size="sm"
            [disabled]="!canUpload()"
            (click)="startUpload()"
            data-testid="upload-submit"
          >
            {{ uploads.isUploading() ? "Uploading…" : "Upload" }}
          </volt-button>
        </div>
      </div>
    </ng-template>
  `,
})
export class UploadDialog {
  protected readonly context = inject(ProjectContextService);
  protected readonly uploads = inject(UploadService);
  private readonly toasts = inject(NotificationService);
  private readonly modal = new ModalController();

  private readonly dialogTemplate =
    viewChild.required<TemplateRef<unknown>>("dialogTemplate");

  protected readonly acceptedTypes = ACCEPTED_TYPES;
  protected readonly maxUploadLabel = "25 MB";

  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly folderId = signal<string | null>(null);
  protected readonly visibility = signal<"public" | "private">("public");
  protected readonly tagsInput = signal("");
  protected readonly downloadOriginalEnabled = signal(true);

  protected readonly canUpload = computed(
    () =>
      this.selectedFiles().length > 0 &&
      !this.uploads.isUploading() &&
      this.context.selectedProjectId() !== null,
  );

  protected readonly totalSizeLabel = computed(() =>
    formatBytes(
      this.selectedFiles().reduce((total, file) => total + file.size, 0),
    ),
  );

  open(): void {
    this.uploads.clear();
    this.selectedFiles.set([]);
    // Backdrop dismissal is disabled while files are in flight: a stray click outside should not
    // hide the only place the per-file result is reported.
    this.modal.open(this.dialogTemplate(), {
      closeOnBackdropClick: !this.uploads.isUploading(),
    });
  }

  close(): void {
    this.modal.close();
  }

  protected onFilesSelected(files: FileList | null): void {
    this.selectedFiles.set(files ? Array.from(files) : []);
  }

  protected onFileInput(event: Event): void {
    this.onFilesSelected((event.target as HTMLInputElement).files);
  }

  protected async startUpload(): Promise<void> {
    const projectId = this.context.selectedProjectId();
    const files = this.selectedFiles();
    if (!projectId || files.length === 0) return;

    await this.uploads.upload(files, {
      projectId,
      folderId: this.folderId(),
      visibility: this.visibility(),
      tags: parseTags(this.tagsInput()),
      downloadOriginalEnabled: this.downloadOriginalEnabled(),
    });

    this.selectedFiles.set([]);

    const failed = this.uploads.failedCount();
    if (failed > 0) {
      this.toasts.error(
        "Upload incomplete",
        `${failed} of ${files.length} upload(s) failed. See the dialog for details.`,
      );
    } else {
      this.toasts.success(
        "Upload started",
        `${files.length} file(s) uploaded. Processing runs in the background.`,
      );
    }
    // Folders and tags may have gained new entries as a side effect of this upload.
    void this.context.refreshProjectScopedData();
  }
}

export { parseTags };
