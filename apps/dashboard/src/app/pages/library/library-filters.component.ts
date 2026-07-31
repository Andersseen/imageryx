import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";
import type { Folder } from "@imageryx/sdk";
import { VoltButton, VoltLabel, VoltNativeSelect } from "@voltui/components";
import { LmnXMarkIcon } from "lumen-icons";
import {
  hasActiveFilters,
  type AssetQuery,
} from "../../core/library/asset-query";

/**
 * The library's filter row.
 *
 * Native `<select>` elements throughout, on purpose: they are keyboard-operable, screen-reader
 * correct and touch-friendly for free, and a filter bar is the one place where a custom listbox
 * buys appearance at the cost of behaviour that has to be reimplemented and re-tested. Volt
 * styles them via `<volt-native-select>` so they still match the rest of the UI.
 *
 * Every change emits a whole new query rather than a field patch, so the parent has one code
 * path for "the view changed" and the URL stays the single source of truth.
 */
@Component({
  selector: "ix-library-filters",
  standalone: true,
  imports: [VoltButton, VoltLabel, VoltNativeSelect, LmnXMarkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      role="group"
      aria-label="Asset filters"
    >
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex flex-col gap-1.5">
          <volt-label htmlFor="filter-folder">Folder</volt-label>
          <volt-native-select
            id="filter-folder"
            (change)="
              emitChange({ folderId: nullableValue($any($event.target).value) })
            "
            data-testid="filter-folder"
          >
            <option value="__any" [selected]="query().folderId === null">
              Any folder
            </option>
            <option value="" [selected]="query().folderId === ''">
              Project root
            </option>
            @for (folder of folders(); track folder.id) {
              <option
                [value]="folder.id"
                [selected]="query().folderId === folder.id"
              >
                {{ folder.path }}
              </option>
            }
          </volt-native-select>
        </div>

        <div class="flex flex-col gap-1.5">
          <volt-label htmlFor="filter-tag">Tag</volt-label>
          <volt-native-select
            id="filter-tag"
            [disabled]="tags().length === 0"
            (change)="emitChange({ tag: $any($event.target).value || null })"
            data-testid="filter-tag"
          >
            <option value="" [selected]="query().tag === null">Any tag</option>
            @for (tag of tags(); track tag) {
              <option [value]="tag" [selected]="query().tag === tag">
                {{ tag }}
              </option>
            }
          </volt-native-select>
        </div>

        <div class="flex flex-col gap-1.5">
          <volt-label htmlFor="filter-status">Processing status</volt-label>
          <volt-native-select
            id="filter-status"
            (change)="
              emitChange({
                processingStatus: $any($event.target).value || null,
              })
            "
            data-testid="filter-status"
          >
            <option value="" [selected]="query().processingStatus === null">
              Any status
            </option>
            @for (status of statuses; track status.value) {
              <option
                [value]="status.value"
                [selected]="query().processingStatus === status.value"
              >
                {{ status.label }}
              </option>
            }
          </volt-native-select>
        </div>

        <div class="flex flex-col gap-1.5">
          <volt-label htmlFor="filter-visibility">Visibility</volt-label>
          <volt-native-select
            id="filter-visibility"
            (change)="
              emitChange({ visibility: $any($event.target).value || null })
            "
            data-testid="filter-visibility"
          >
            <option value="" [selected]="query().visibility === null">
              Any visibility
            </option>
            <option value="public" [selected]="query().visibility === 'public'">
              Public
            </option>
            <option
              value="private"
              [selected]="query().visibility === 'private'"
            >
              Private
            </option>
          </volt-native-select>
        </div>

        <div class="flex flex-col gap-1.5">
          <volt-label htmlFor="filter-deleted">Deleted assets</volt-label>
          <volt-native-select
            id="filter-deleted"
            (change)="emitChange({ deleted: $any($event.target).value })"
            data-testid="filter-deleted"
          >
            <option value="active" [selected]="query().deleted === 'active'">
              Hide deleted
            </option>
            <option value="deleted" [selected]="query().deleted === 'deleted'">
              Deleted only
            </option>
            <option value="all" [selected]="query().deleted === 'all'">
              Show all
            </option>
          </volt-native-select>
        </div>

        <div class="flex flex-col gap-1.5">
          <volt-label htmlFor="filter-sort">Sort by</volt-label>
          <volt-native-select
            id="filter-sort"
            (change)="onSortChange($any($event.target).value)"
            data-testid="filter-sort"
          >
            @for (option of sortOptions; track option.value) {
              <option
                [value]="option.value"
                [selected]="sortValue() === option.value"
              >
                {{ option.label }}
              </option>
            }
          </volt-native-select>
        </div>
      </div>

      @if (isFiltered()) {
        <div>
          <volt-button
            variant="outline"
            size="sm"
            (click)="clear.emit()"
            data-testid="clear-filters"
          >
            <lmn-x-mark slot="leading" [size]="14" />
            Clear filters
          </volt-button>
        </div>
      }
    </div>
  `,
})
export class LibraryFilters {
  readonly query = input.required<AssetQuery>();
  readonly folders = input.required<Folder[]>();
  readonly tags = input.required<string[]>();

  readonly queryChange = output<Partial<AssetQuery>>();
  readonly clear = output<void>();

  protected readonly statuses = [
    { value: "ready", label: "Ready" },
    { value: "processing", label: "Processing" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
  ] as const;

  /** Field and direction are one control: "Newest first" is a single idea, not two dropdowns. */
  protected readonly sortOptions = [
    { value: "createdAt:desc", label: "Newest first" },
    { value: "createdAt:asc", label: "Oldest first" },
    { value: "name:asc", label: "Name A–Z" },
    { value: "name:desc", label: "Name Z–A" },
    { value: "sizeBytes:desc", label: "Largest first" },
    { value: "sizeBytes:asc", label: "Smallest first" },
    { value: "updatedAt:desc", label: "Recently updated" },
  ] as const;

  protected readonly isFiltered = computed(() =>
    hasActiveFilters(this.query()),
  );
  protected readonly sortValue = computed(
    () => `${this.query().sortField}:${this.query().sortDirection}`,
  );

  /** `"__any"` distinguishes "no folder filter" from `""`, which really means "root level only". */
  protected nullableValue(value: string): string | null {
    return value === "__any" ? null : value;
  }

  protected emitChange(change: Partial<AssetQuery>): void {
    this.queryChange.emit(change);
  }

  protected onSortChange(value: string): void {
    const [sortField, sortDirection] = value.split(":");
    this.queryChange.emit({
      sortField: sortField as AssetQuery["sortField"],
      sortDirection: sortDirection === "asc" ? "asc" : "desc",
    });
  }
}
