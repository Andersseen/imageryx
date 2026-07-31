import { computed, signal, type Signal } from "@angular/core";
import { describeApiError, type ApiErrorInfo } from "./api-error";

export type AsyncStatus =
  | "idle"
  | "loading"
  | "refreshing"
  | "success"
  | "error";

export interface AsyncStoreOptions {
  /**
   * When true, a failed *refresh* keeps the previously-loaded data visible alongside the error
   * banner instead of blanking the page. Partial data beats an empty screen when the user was
   * already looking at something valid.
   */
  keepDataOnRefreshError?: boolean;
}

/**
 * Signal-backed load/refresh/error state for a single asynchronous read.
 *
 * Two things this exists to get right, which every hand-rolled `isLoading` flag gets wrong:
 *
 * 1. **Initial load vs. refresh are different states.** A first load shows skeletons; a refresh
 *    keeps the current rows on screen and only dims them. Collapsing both into one boolean makes
 *    every filter change flash an empty page.
 * 2. **Out-of-order responses.** Typing in a search box fires overlapping requests; without a
 *    generation counter the slower earlier response can overwrite the newer one. Each `load()`
 *    takes a ticket and a stale ticket's result is dropped, never rendered.
 */
export class AsyncStore<T> {
  private readonly state = signal<{
    status: AsyncStatus;
    data: T | null;
    error: ApiErrorInfo | null;
  }>({ status: "idle", data: null, error: null });

  /** Monotonic request ticket — only the newest in-flight request may write to `state`. */
  private generation = 0;

  constructor(private readonly options: AsyncStoreOptions = {}) {}

  readonly status: Signal<AsyncStatus> = computed(() => this.state().status);
  readonly data: Signal<T | null> = computed(() => this.state().data);
  readonly error: Signal<ApiErrorInfo | null> = computed(
    () => this.state().error,
  );

  /** First load with nothing to show yet — render skeletons. */
  readonly isLoading = computed(() => this.state().status === "loading");
  /** A reload while data is already on screen — keep it visible, show a subtle busy hint. */
  readonly isRefreshing = computed(() => this.state().status === "refreshing");
  readonly isBusy = computed(() => this.isLoading() || this.isRefreshing());
  readonly hasError = computed(() => this.state().error !== null);
  readonly hasData = computed(() => this.state().data !== null);

  /**
   * Runs `fetcher`, moving through the correct status for whether data is already present.
   * Returns the loaded value, or `null` if the call failed or was superseded.
   */
  async load(fetcher: () => Promise<T>): Promise<T | null> {
    const ticket = ++this.generation;
    const hadData = this.state().data !== null;

    this.state.update((current) => ({
      status: hadData ? "refreshing" : "loading",
      data: current.data,
      error: null,
    }));

    try {
      const data = await fetcher();
      if (ticket !== this.generation) return null;
      this.state.set({ status: "success", data, error: null });
      return data;
    } catch (error) {
      if (ticket !== this.generation) return null;
      const info = describeApiError(error);
      this.state.update((current) => ({
        status: "error",
        data:
          hadData && this.options.keepDataOnRefreshError ? current.data : null,
        error: info,
      }));
      return null;
    }
  }

  /**
   * Replaces the loaded value without a round trip — for applying a mutation's own response to
   * the list already on screen, instead of refetching the whole page after a one-field edit.
   * Ignored when nothing is loaded, so it can never fabricate data out of an empty state.
   */
  patch(update: (current: T) => T): void {
    const current = this.state().data;
    if (current === null) return;
    this.state.set({ status: "success", data: update(current), error: null });
  }

  /** Discards state and cancels any in-flight response (e.g. after switching projects). */
  reset(): void {
    this.generation++;
    this.state.set({ status: "idle", data: null, error: null });
  }
}
