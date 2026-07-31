import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { ProcessingStatus } from "@imageryx/contracts";
import { VoltBadge } from "@voltui/components";
import {
  LmnArrowPathIcon,
  LmnCheckCircleIcon,
  LmnClockIcon,
  LmnExclamationCircleIcon,
} from "lumen-icons";

/**
 * Processing status, conveyed by icon **and** word — never by colour alone.
 *
 * This matters beyond preference: `ready` and `failed` are the two states a user acts on, and a
 * red-vs-green badge is exactly the pair the most common forms of colour blindness cannot
 * distinguish. The shape of the icon and the literal text carry the meaning; the tint is
 * reinforcement.
 */
@Component({
  selector: "ix-status-badge",
  standalone: true,
  imports: [
    VoltBadge,
    LmnArrowPathIcon,
    LmnCheckCircleIcon,
    LmnClockIcon,
    LmnExclamationCircleIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <volt-badge [variant]="badgeVariant()" data-testid="status-badge">
      @switch (status()) {
        @case ("ready") {
          <lmn-check-circle slot="leading" [size]="12" />
        }
        @case ("failed") {
          <lmn-exclamation-circle slot="leading" [size]="12" />
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
export class StatusBadge {
  readonly status = input.required<ProcessingStatus>();

  protected readonly label = computed(() => {
    switch (this.status()) {
      case "ready":
        return "Ready";
      case "failed":
        return "Failed";
      case "processing":
        return "Processing";
      default:
        return "Pending";
    }
  });

  protected readonly badgeVariant = computed<
    "solid" | "secondary" | "outline" | "destructive"
  >(() => {
    switch (this.status()) {
      case "ready":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  });
}
