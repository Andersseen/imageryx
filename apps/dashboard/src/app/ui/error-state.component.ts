import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { VoltButton } from "@voltui/components";
import { LmnArrowPathIcon, LmnExclamationTriangleIcon } from "lumen-icons";
import type { ApiErrorInfo } from "../core/api/api-error";

/**
 * The single way an API failure is rendered anywhere in the dashboard.
 *
 * Two deliberate rules, both enforced here rather than trusted to each caller:
 * a Retry button appears only when `error.retryable` says re-running could plausibly help
 * (offering "Retry" on a 404 is a lie), and the machine code / request id are small print for
 * correlating with a server log, never the headline.
 */
@Component({
  selector: "ix-error-state",
  standalone: true,
  imports: [VoltButton, LmnArrowPathIcon, LmnExclamationTriangleIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      role="alert"
      data-testid="error-state"
    >
      <div class="flex items-start gap-3">
        <lmn-exclamation-triangle
          [size]="20"
          tone="destructive"
          class="mt-0.5 shrink-0"
        />
        <div class="flex min-w-0 flex-col gap-1">
          <p class="text-sm font-medium text-foreground">{{ error().title }}</p>
          <p class="text-sm text-muted-foreground">{{ error().detail }}</p>
          @if (error().code || error().requestId) {
            <p class="pt-1 text-xs text-muted-foreground">
              @if (error().code) {
                <span
                  >code: <code>{{ error().code }}</code></span
                >
              }
              @if (error().code && error().requestId) {
                <span aria-hidden="true"> &middot; </span>
              }
              @if (error().requestId) {
                <span
                  >request: <code>{{ error().requestId }}</code></span
                >
              }
            </p>
          }
        </div>
      </div>

      @if (error().retryable) {
        <div>
          <volt-button variant="outline" size="sm" (click)="retry.emit()">
            <lmn-arrow-path slot="leading" [size]="14" />
            {{ retryLabel() }}
          </volt-button>
        </div>
      }
    </div>
  `,
})
export class ErrorState {
  readonly error = input.required<ApiErrorInfo>();
  readonly retryLabel = input<string>("Try again");
  readonly retry = output<void>();
}
