import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import type { AssetDetails, Folder } from "@imageryx/sdk";
import {
  VoltButton,
  VoltInput,
  VoltLabel,
  VoltNativeSelect,
  VoltSwitch,
} from "@voltui/components";
import { type AssetWorkspaceService } from "../../../core/assets/asset-workspace.service";
import { parseTags } from "../../../core/format/tags";
import { NotificationService } from "../../../core/notifications/notification.service";

interface SettingsFormValue {
  name: string;
  slug: string;
  folderId: string | null;
  tags: string;
  visibility: "public" | "private";
  downloadOriginalEnabled: boolean;
}

function toFormValue(asset: AssetDetails): SettingsFormValue {
  return {
    name: asset.name,
    slug: asset.slug,
    folderId: asset.folderId,
    tags: asset.tags.join(", "),
    visibility: asset.visibility,
    downloadOriginalEnabled: asset.downloadOriginalEnabled,
  };
}

/**
 * The one place name, slug, folder, tags, visibility and original-download policy are edited.
 *
 * A slug change moves the asset's *logical* path, which is embedded in every public delivery
 * URL for it — the form confirms before submitting one, the same way the header's delete action
 * confirms, rather than silently breaking a link someone may have already shared.
 */
@Component({
  selector: "ix-asset-settings",
  standalone: true,
  imports: [VoltButton, VoltInput, VoltLabel, VoltNativeSelect, VoltSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex max-w-xl flex-col gap-4" (submit)="save($event)">
      <div class="flex flex-col gap-1.5">
        <volt-label htmlFor="settings-name">Name</volt-label>
        <volt-input
          id="settings-name"
          [value]="form().name"
          (valueChange)="patch({ name: $event })"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <volt-label htmlFor="settings-slug">Slug</volt-label>
        <volt-input
          id="settings-slug"
          [value]="form().slug"
          (valueChange)="patch({ slug: $event })"
        />
        @if (slugChanged()) {
          <p class="text-xs text-amber-600 dark:text-amber-400">
            Changing the slug changes this asset's public delivery URL.
          </p>
        }
      </div>

      <div class="flex flex-col gap-1.5">
        <volt-label htmlFor="settings-folder">Folder</volt-label>
        <volt-native-select
          id="settings-folder"
          (change)="patch({ folderId: $any($event.target).value || null })"
        >
          <option value="" [selected]="!form().folderId">Project root</option>
          @for (folder of folders(); track folder.id) {
            <option
              [value]="folder.id"
              [selected]="folder.id === form().folderId"
            >
              {{ folder.path }}
            </option>
          }
        </volt-native-select>
      </div>

      <div class="flex flex-col gap-1.5">
        <volt-label htmlFor="settings-tags">Tags</volt-label>
        <volt-input
          id="settings-tags"
          placeholder="hero, marketing"
          [value]="form().tags"
          (valueChange)="patch({ tags: $event })"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <volt-label htmlFor="settings-visibility">Visibility</volt-label>
        <volt-native-select
          id="settings-visibility"
          (change)="patch({ visibility: $any($event.target).value })"
        >
          <option value="public" [selected]="form().visibility === 'public'">
            Public — served at a delivery URL
          </option>
          <option value="private" [selected]="form().visibility === 'private'">
            Private — signed links only
          </option>
        </volt-native-select>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="flex flex-col">
          <span class="text-sm font-medium">Allow original downloads</span>
          <span class="text-xs text-muted-foreground">
            Controls whether a signed link can serve the original file.
          </span>
        </div>
        <volt-switch
          [checked]="form().downloadOriginalEnabled"
          (checkedChange)="patch({ downloadOriginalEnabled: $event })"
        />
      </div>

      <div class="flex items-center gap-2 border-t border-border pt-4">
        <volt-button
          variant="solid"
          size="sm"
          type="submit"
          [disabled]="!isDirty() || saving()"
          data-testid="settings-save"
        >
          {{ saving() ? "Saving…" : "Save changes" }}
        </volt-button>
        <volt-button
          variant="outline"
          size="sm"
          type="button"
          [disabled]="!isDirty()"
          (click)="resetForm()"
        >
          Discard changes
        </volt-button>
        @if (isDirty()) {
          <span class="text-xs text-muted-foreground" role="status"
            >Unsaved changes</span
          >
        }
      </div>
    </form>
  `,
})
export class AssetSettings {
  readonly asset = input.required<AssetDetails>();
  readonly workspace = input.required<AssetWorkspaceService>();
  readonly folders = input<Folder[]>([]);

  private readonly notifications = inject(NotificationService);

  protected readonly form = signal<SettingsFormValue>(
    toFormValue(
      // input() is required, but a signal initializer runs before inputs are bound; the effect
      // below keeps this in sync from the first real value onward, so this placeholder never renders.
      { tags: [] } as unknown as AssetDetails,
    ),
  );
  protected readonly saving = signal(false);
  private baseline: SettingsFormValue | null = null;

  protected readonly isDirty = computed(() => {
    const base = this.baseline;
    return (
      base !== null && JSON.stringify(base) !== JSON.stringify(this.form())
    );
  });

  protected readonly slugChanged = computed(
    () => this.baseline !== null && this.baseline.slug !== this.form().slug,
  );

  constructor() {
    effect(() => {
      const asset = this.asset();
      // Only resync from the server when nothing is unsaved — otherwise a background refresh
      // (e.g. after generating a variant) would silently discard whatever the user was typing.
      if (this.baseline === null || !this.isDirty()) {
        const next = toFormValue(asset);
        this.baseline = next;
        this.form.set(next);
      }
    });
  }

  protected patch(change: Partial<SettingsFormValue>): void {
    this.form.update((current) => ({ ...current, ...change }));
  }

  protected resetForm(): void {
    if (this.baseline) this.form.set(this.baseline);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const baseline = this.baseline;
    if (!baseline) return;

    if (this.slugChanged()) {
      const confirmed = globalThis.confirm(
        `Change this asset's slug from "${baseline.slug}" to "${this.form().slug}"?\n\nIts public delivery URL will change. Any link already shared using the old path will stop working.`,
      );
      if (!confirmed) return;
    }

    this.saving.set(true);
    try {
      const value = this.form();
      const workspace = this.workspace();

      if (value.folderId !== baseline.folderId) {
        const moveResult = await workspace.move(value.folderId);
        if (!moveResult.ok) {
          this.notifications.error(
            moveResult.error.title,
            moveResult.error.detail,
          );
          return;
        }
      }

      if (value.tags !== baseline.tags) {
        const tagsResult = await workspace.setTags(parseTags(value.tags));
        if (!tagsResult.ok) {
          this.notifications.error(
            tagsResult.error.title,
            tagsResult.error.detail,
          );
          return;
        }
      }

      const settingsChanged =
        value.name !== baseline.name ||
        value.slug !== baseline.slug ||
        value.visibility !== baseline.visibility ||
        value.downloadOriginalEnabled !== baseline.downloadOriginalEnabled;

      if (settingsChanged) {
        const result = await workspace.updateSettings({
          name: value.name !== baseline.name ? value.name : undefined,
          slug: value.slug !== baseline.slug ? value.slug : undefined,
          visibility:
            value.visibility !== baseline.visibility
              ? value.visibility
              : undefined,
          downloadOriginalEnabled:
            value.downloadOriginalEnabled !== baseline.downloadOriginalEnabled
              ? value.downloadOriginalEnabled
              : undefined,
        });
        if (!result.ok) {
          this.notifications.error(result.error.title, result.error.detail);
          return;
        }
      }

      this.notifications.success(
        "Settings saved",
        "Asset settings were updated.",
      );
    } finally {
      this.saving.set(false);
    }
  }
}
