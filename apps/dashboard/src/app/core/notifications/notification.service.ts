import { computed, Injectable, signal } from "@angular/core";

export type NotificationTone = "success" | "error" | "warning" | "info";

export interface Notification {
  readonly id: string;
  readonly tone: NotificationTone;
  readonly title: string;
  readonly message: string;
  /** `0` pins the notification until it is dismissed by hand. */
  readonly durationMs: number;
}

const DEFAULT_DURATION_MS = 5000;
/** Errors stay longer: they usually carry something the user has to read and act on. */
const ERROR_DURATION_MS = 9000;
/** Beyond this, older notifications are dropped rather than stacking off the screen. */
const MAX_VISIBLE = 4;

/**
 * The dashboard's transient notifications.
 *
 * Quartz Headless ships a `ToastService`, and the UI boundary in context.md would normally put
 * this kind of behaviour there. Two concrete problems made owning it the better call, both found
 * by running the real thing rather than by reading the source:
 *
 * 1. **Its updates never reached the view.** Verified end to end in a browser: after two real
 *    actions its `toasts()` signal held two entries, while the component rendering that signal
 *    stayed empty — the queue and the view were not connected under this app's zoneless change
 *    detection.
 * 2. **It drives a permanent 100 ms timer.** Its tick rebuilds the toast array unconditionally,
 *    producing a new array identity every 100 ms whether or not anything is showing. In a
 *    zoneless app that is a change-detection pass ten times a second, forever, for a UI element
 *    that is usually not on screen at all.
 *
 * This implementation schedules one timer per notification and clears it on dismissal, so an
 * idle dashboard schedules nothing. Quartz is still used for the behaviour it does well here —
 * `DialogService` backs every modal (see `ui/modal.ts`).
 */
@Injectable({ providedIn: "root" })
export class NotificationService {
  private readonly queue = signal<Notification[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  readonly notifications = computed(() => this.queue());

  success(title: string, message: string): string {
    return this.show("success", title, message);
  }

  error(title: string, message: string): string {
    return this.show("error", title, message, ERROR_DURATION_MS);
  }

  warning(title: string, message: string): string {
    return this.show("warning", title, message, ERROR_DURATION_MS);
  }

  info(title: string, message: string): string {
    return this.show("info", title, message);
  }

  show(
    tone: NotificationTone,
    title: string,
    message: string,
    durationMs: number = DEFAULT_DURATION_MS,
  ): string {
    const id = `notification-${this.nextId++}`;
    const notification: Notification = { id, tone, title, message, durationMs };

    this.queue.update((current) => {
      const next = [...current, notification];
      // Dropping from the front keeps the newest — the one describing what just happened — visible.
      const overflow = next.length - MAX_VISIBLE;
      if (overflow <= 0) return next;
      for (const dropped of next.slice(0, overflow))
        this.clearTimer(dropped.id);
      return next.slice(overflow);
    });

    if (durationMs > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), durationMs),
      );
    }
    return id;
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this.queue.update((current) => current.filter((item) => item.id !== id));
  }

  dismissAll(): void {
    for (const id of [...this.timers.keys()]) this.clearTimer(id);
    this.queue.set([]);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
