import type { ProcessingJob } from "@imageryx/contracts";
import { isTerminal } from "./job-eligibility";

export const JOB_POLL_INTERVAL_MS = 1200;
export const JOB_POLL_TIMEOUT_MS = 45_000;

export interface JobPollHandle {
  /** Resolves once the job reaches a terminal state, a fetch fails, or the poll times out. Never rejects. */
  readonly done: Promise<void>;
  /** Stops polling before the next tick. Safe to call after `done` has already settled. */
  stop(): void;
}

/**
 * Polls one job by id until it reaches a terminal state — the shared primitive behind both the
 * processing list (one instance per visible non-terminal row) and the job detail page (a single
 * instance). Deliberately job-scoped, not list-scoped: refetching a whole page on a timer would
 * violate the "never poll globally" rule the rest of the dashboard already follows for variants.
 *
 * Pauses (without resetting the timeout clock) while the tab is hidden, and gives up after
 * `timeoutMs` — the job may still finish server-side; this loop just stops claiming to know, the
 * same contract `AssetWorkspaceService.pollJob` makes for variant generation.
 */
export function pollJobUntilTerminal(
  fetchJob: () => Promise<ProcessingJob>,
  onUpdate: (job: ProcessingJob) => void,
  intervalMs: number = JOB_POLL_INTERVAL_MS,
  timeoutMs: number = JOB_POLL_TIMEOUT_MS,
): JobPollHandle {
  let stopped = false;

  const done = (async () => {
    const startedAt = Date.now();
    while (!stopped && Date.now() - startedAt < timeoutMs) {
      await sleep(intervalMs);
      if (stopped) return;
      if (isDocumentHidden()) continue;

      let job: ProcessingJob;
      try {
        job = await fetchJob();
      } catch {
        return;
      }
      if (stopped) return;
      onUpdate(job);
      if (isTerminal(job.status)) return;
    }
  })();

  return { done, stop: () => (stopped = true) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}
