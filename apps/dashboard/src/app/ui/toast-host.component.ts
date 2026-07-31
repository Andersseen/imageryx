import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { VoltButton } from "@voltui/components";
import {
  LmnCheckCircleIcon,
  LmnExclamationCircleIcon,
  LmnExclamationTriangleIcon,
  LmnInformationCircleIcon,
  LmnXMarkIcon,
} from "lumen-icons";
import {
  NotificationService,
  type NotificationTone,
} from "../core/notifications/notification.service";

/**
 * Renders the queue `NotificationService` owns.
 *
 * Built from Volt's *theme tokens* (`bg-card`, `border-border`, `text-foreground`) rather than
 * its `<volt-toast>` component: that component depends on an `NgpToastOptions` provider supplied
 * by a surrounding ng-primitives toaster, and without one it throws NG0201 the moment a toast
 * actually renders. Using the tokens keeps it visually part of the same system with no hidden
 * provider requirement.
 *
 * Accessibility: `role="status"` with `aria-live="polite"` announces results without stealing
 * focus, and each entry names its severity in words as well as showing an icon and tint — so
 * "error" survives for anyone who cannot distinguish the colour.
 */
@Component({
  selector: "ix-toast-host",
  standalone: true,
  imports: [
    VoltButton,
    LmnCheckCircleIcon,
    LmnExclamationCircleIcon,
    LmnExclamationTriangleIcon,
    LmnInformationCircleIcon,
    LmnXMarkIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (notification of notifications(); track notification.id) {
        <div
          class="pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 border border-border bg-card p-3 text-card-foreground shadow-lg"
          [class.border-l-green-500]="notification.tone === 'success'"
          [class.border-l-destructive]="notification.tone === 'error'"
          [class.border-l-amber-500]="notification.tone === 'warning'"
          [class.border-l-primary]="notification.tone === 'info'"
          data-testid="toast"
        >
          <span class="mt-0.5 shrink-0" aria-hidden="true">
            @switch (notification.tone) {
              @case ("success") {
                <lmn-check-circle [size]="16" tone="success" />
              }
              @case ("error") {
                <lmn-exclamation-circle [size]="16" tone="destructive" />
              }
              @case ("warning") {
                <lmn-exclamation-triangle [size]="16" tone="warning" />
              }
              @default {
                <lmn-information-circle [size]="16" tone="info" />
              }
            }
          </span>

          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-sm font-medium">
              <span class="sr-only">{{ toneLabel(notification.tone) }}: </span>
              {{ notification.title }}
            </span>
            <span class="break-words text-sm text-muted-foreground">
              {{ notification.message }}
            </span>
          </div>

          <volt-button
            variant="ghost"
            size="icon"
            (click)="service.dismiss(notification.id)"
          >
            <span class="sr-only">Dismiss: {{ notification.title }}</span>
            <lmn-x-mark [size]="14" />
          </volt-button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly service = inject(NotificationService);
  protected readonly notifications = computed(() =>
    this.service.notifications(),
  );

  protected toneLabel(tone: NotificationTone): string {
    switch (tone) {
      case "success":
        return "Success";
      case "error":
        return "Error";
      case "warning":
        return "Warning";
      default:
        return "Note";
    }
  }
}
