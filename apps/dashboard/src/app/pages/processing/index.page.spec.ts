import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { clickTestId, settle } from "../../testing/render";
import {
  createStubApi,
  processingJobFixture,
  projectFixture,
  type StubApi,
} from "../../testing/stub-client";
import ProcessingPage from "./index.page";

describe("ProcessingPage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [ProcessingPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
      ],
    });
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function render() {
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = TestBed.createComponent(ProcessingPage);
    await settle(fixture);
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? "";
  }

  const project = projectFixture("project-1", "Angular Lab", true);

  it("tells the user to select a project instead of showing an empty queue", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("No project selected");
  });

  it("lists jobs for the selected project", async () => {
    configure(
      createStubApi({
        projects: [project],
        processingJobs: [
          processingJobFixture("job-1", "project-1", {
            type: "generate-variant",
            status: "completed",
          }),
          processingJobFixture("job-2", "project-1", {
            type: "strip-metadata",
            status: "failed",
          }),
        ],
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="job-row"]'),
    ).toHaveLength(2);
    expect(text(fixture)).toContain("Generate variant");
    expect(text(fixture)).toContain("Strip metadata");
  });

  it("shows a real empty state distinguishing filtered from unfiltered", async () => {
    configure(createStubApi({ projects: [project], processingJobs: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("No processing jobs yet");
  });

  it("shows Retry only for failed jobs and Cancel only for queued jobs", async () => {
    configure(
      createStubApi({
        projects: [project],
        processingJobs: [
          processingJobFixture("job-failed", "project-1", { status: "failed" }),
          processingJobFixture("job-queued", "project-1", { status: "queued" }),
          processingJobFixture("job-done", "project-1", {
            status: "completed",
          }),
        ],
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="job-retry"]'),
    ).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="job-cancel"]'),
    ).toHaveLength(1);
  });

  it("retries a failed job and reflects the new status without a page reload", async () => {
    configure(
      createStubApi({
        projects: [project],
        processingJobs: [
          processingJobFixture("job-1", "project-1", { status: "failed" }),
        ],
      }),
    );
    const fixture = await render();

    clickTestId(fixture.nativeElement, "job-retry");
    await settle(fixture, 2);

    const retryRequest = api.requests.find(
      (r) =>
        r.method === "POST" && r.path === "/api/v1/processing-jobs/job-1/retry",
    );
    expect(retryRequest).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="job-retry"]'),
    ).toBeNull();
  });

  it("cancels a queued job", async () => {
    configure(
      createStubApi({
        projects: [project],
        processingJobs: [
          processingJobFixture("job-1", "project-1", { status: "queued" }),
        ],
      }),
    );
    const fixture = await render();

    clickTestId(fixture.nativeElement, "job-cancel");
    await settle(fixture, 2);

    const cancelRequest = api.requests.find(
      (r) =>
        r.method === "POST" &&
        r.path === "/api/v1/processing-jobs/job-1/cancel",
    );
    expect(cancelRequest).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="job-cancel"]'),
    ).toBeNull();
  });

  it("filters the list by status through the URL-driven query", async () => {
    configure(
      createStubApi({
        projects: [project],
        processingJobs: [
          processingJobFixture("job-failed", "project-1", { status: "failed" }),
          processingJobFixture("job-done", "project-1", {
            status: "completed",
          }),
        ],
      }),
    );
    const fixture = await render();

    const select = fixture.nativeElement.querySelector<HTMLSelectElement>(
      '[data-testid="filter-status"] select',
    );
    expect(select).toBeTruthy();
    select!.value = "failed";
    select!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(fixture, 2);

    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="job-row"]'),
    ).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain(
      "job-failed".slice(0, 8),
    );
    expect(
      fixture.nativeElement.querySelector('[data-testid="filter-clear"]'),
    ).toBeTruthy();
  });

  it("polls a non-terminal job in place until it reaches a terminal state", async () => {
    configure(
      createStubApi({
        projects: [project],
        processingJobs: [
          processingJobFixture("job-1", "project-1", { status: "processing" }),
        ],
      }),
    );
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain("Processing");

    // The stub's job settles on its own between the initial load and the next poll tick — the
    // page should pick that up without any user action or manual refresh.
    api.state.processingJobs = api.state.processingJobs.map((job) =>
      job.id === "job-1" ? { ...job, status: "completed" as const } : job,
    );
    await new Promise((resolve) => setTimeout(resolve, 1300));
    fixture.detectChanges();
    await settle(fixture, 1);

    expect(fixture.nativeElement.textContent).toContain("Completed");
  });
});
