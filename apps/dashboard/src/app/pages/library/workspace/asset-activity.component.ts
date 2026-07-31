import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type { AssetDetails } from "@imageryx/sdk";
import { VoltButton } from "@voltui/components";
import { toActivityTimeline } from "../../../core/assets/activity-view";
import {
  formatDateTime,
  formatRelativeTime,
} from "../../../core/format/format";
import { EmptyState } from "../../../ui/empty-state.component";

/**
 * A real, human-readable timeline — `describeActivity` turns every event into a sentence, never
 * raw JSON as the primary interface. An expandable "technical detail" per entry exists for
 * anyone who wants the underlying metadata, but it is opt-in, not the default view.
 */
@Component({
  selector: "ix-asset-activity",
  standalone: true,
  imports: [RouterLink, VoltButton, EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (timeline().length === 0) {
      <ix-empty-state
        title="No activity yet"
        description="Actions on this asset will appear here."
      />
    } @else {
      <ol class="flex flex-col gap-3" data-testid="activity-timeline">
        @for (item of timeline(); track item.entry.id) {
          <li
            class="flex flex-col gap-1 rounded-lg border border-border p-3"
            data-testid="activity-entry"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm">{{ item.description }}</span>
              <time
                class="text-xs text-muted-foreground"
                [attr.datetime]="item.entry.createdAt"
              >
                {{ relativeLabel(item.entry.createdAt) }}
              </time>
            </div>
            <div
              class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            >
              <span>{{ absoluteLabel(item.entry.createdAt) }}</span>
              @if (item.linkedJobId; as jobId) {
                <a [routerLink]="['/processing', jobId]" class="text-primary"
                  >View job</a
                >
              }
              @if (item.entry.metadata) {
                <volt-button
                  variant="ghost"
                  size="sm"
                  (click)="toggleDetail(item.entry.id)"
                >
                  {{
                    expandedId() === item.entry.id ? "Hide details" : "Details"
                  }}
                </volt-button>
              }
            </div>
            @if (expandedId() === item.entry.id && item.entry.metadata) {
              <pre
                class="overflow-x-auto rounded-md border border-border bg-muted/30 p-2 text-xs"
                >{{ formatMetadata(item.entry.metadata) }}</pre
              >
            }
          </li>
        }
      </ol>
    }
  `,
})
export class AssetActivity {
  readonly asset = input.required<AssetDetails>();

  protected readonly expandedId = signal<string | null>(null);
  protected readonly timeline = computed(() =>
    toActivityTimeline(this.asset().activity),
  );

  protected toggleDetail(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected relativeLabel(iso: string): string {
    return formatRelativeTime(iso);
  }

  protected absoluteLabel(iso: string): string {
    return formatDateTime(iso);
  }

  protected formatMetadata(metadata: Record<string, unknown>): string {
    return JSON.stringify(metadata, null, 2);
  }
}
