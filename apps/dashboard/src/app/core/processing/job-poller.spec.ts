import { afterEach, describe, expect, it, vi } from "vitest";
import { processingJobFixture } from "../../testing/stub-client";
import { pollJobUntilTerminal } from "./job-poller";

const INTERVAL_MS = 5;
const TIMEOUT_MS = 40;

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("pollJobUntilTerminal", () => {
  afterEach(() => {
    setVisibility("visible");
    vi.restoreAllMocks();
  });

  it("polls repeatedly until the job reaches a terminal state", async () => {
    const statuses = ["queued", "processing", "completed"] as const;
    let call = 0;
    const fetchJob = vi.fn(async () =>
      processingJobFixture("job-1", "project-1", {
        status: statuses[Math.min(call++, statuses.length - 1)],
      }),
    );
    const updates: string[] = [];

    const handle = pollJobUntilTerminal(
      fetchJob,
      (job) => updates.push(job.status),
      INTERVAL_MS,
      TIMEOUT_MS,
    );
    await handle.done;

    expect(updates).toEqual(["queued", "processing", "completed"]);
  });

  it("stops issuing updates once stop() is called", async () => {
    const fetchJob = vi.fn(async () =>
      processingJobFixture("job-1", "project-1", { status: "queued" }),
    );
    const onUpdate = vi.fn();

    const handle = pollJobUntilTerminal(
      fetchJob,
      onUpdate,
      INTERVAL_MS,
      TIMEOUT_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 2));
    handle.stop();
    const countAtStop = onUpdate.mock.calls.length;
    await handle.done;

    expect(onUpdate.mock.calls.length).toBe(countAtStop);
  });

  it("gives up after the timeout without throwing when the job never settles", async () => {
    const fetchJob = vi.fn(async () =>
      processingJobFixture("job-1", "project-1", { status: "processing" }),
    );
    const onUpdate = vi.fn();

    const handle = pollJobUntilTerminal(
      fetchJob,
      onUpdate,
      INTERVAL_MS,
      TIMEOUT_MS,
    );
    await expect(handle.done).resolves.toBeUndefined();
    expect(onUpdate).toHaveBeenCalled();
    expect(
      onUpdate.mock.calls.every(([job]) => job.status === "processing"),
    ).toBe(true);
  });

  it("stops silently if the fetch itself fails", async () => {
    const fetchJob = vi.fn(async () => {
      throw new Error("network down");
    });
    const onUpdate = vi.fn();

    const handle = pollJobUntilTerminal(
      fetchJob,
      onUpdate,
      INTERVAL_MS,
      TIMEOUT_MS,
    );
    await expect(handle.done).resolves.toBeUndefined();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does not fetch while the document is hidden", async () => {
    setVisibility("hidden");
    const fetchJob = vi.fn(async () =>
      processingJobFixture("job-1", "project-1", { status: "queued" }),
    );

    const handle = pollJobUntilTerminal(
      fetchJob,
      vi.fn(),
      INTERVAL_MS,
      TIMEOUT_MS,
    );
    await handle.done;

    expect(fetchJob).not.toHaveBeenCalled();
  });
});
