import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { ProcessingJobStatus } from "@imageryx/contracts";
import { VoltBadge } from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnCheckCircleIcon,
  LmnClockIcon,
  LmnExclamationCircleIcon,
  LmnXCircleIcon,
} from "lumen-icons";

/** `ProcessingJobStatus`'s badge — a distinct type from asset-level `ProcessingStatus` (see `ix-status-badge`), five states instead of four, `cancelled` among them. */
@Component({
  selector: "ix-job-status-badge",
  standalone: true,
  imports: [
    VoltBadge,
    LmnArrowPathIcon,
    LmnCheckCircleIcon,
    LmnClockIcon,
    LmnExclamationCircleIcon,
    LmnXCircleIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <volt-badge [variant]="badgeVariant()" data-testid="job-status-badge">
      @switch (status()) {
        @case ("completed") {
          <lmn-check-circle slot="leading" [size]="12" />
        }
        @case ("failed") {
          <lmn-exclamation-circle slot="leading" [size]="12" />
        }
        @case ("cancelled") {
          <lmn-x-circle slot="leading" [size]="12" />
        }
        @case ("processing") {
          <lmn-arrow-path slot="leading" [size]="12" />
        }
        @default {
          <lmn-clock slot="leading" [size]="12" />
        }
      }
      <span>{{ label() }}</span>
    </volt-badge>
  `,
})
export class JobStatusBadge {
  readonly status = input.required<ProcessingJobStatus>();

  protected readonly label = computed(() => {
    switch (this.status()) {
      case "queued":
        return "Queued";
      case "processing":
        return "Processing";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "cancelled":
        return "Cancelled";
    }
  });

  protected readonly badgeVariant = computed<
    "solid" | "secondary" | "outline" | "destructive"
  >(() => {
    switch (this.status()) {
      case "completed":
        return "secondary";
      case "failed":
        return "destructive";
      case "cancelled":
        return "outline";
      default:
        return "outline";
    }
  });
}
