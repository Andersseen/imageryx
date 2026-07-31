import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { clickTestId, settleHarness } from "../../testing/render";
import {
  createStubApi,
  processingJobFixture,
  type StubApi,
} from "../../testing/stub-client";
import ProcessingJobPage from "./[jobId].page";

describe("ProcessingJobPage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      teardown: { destroyAfterEach: true },
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "processing/:jobId", component: ProcessingJobPage },
        ]),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
      ],
    });
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  async function render(jobId = "job-1") {
    const harness = await RouterTestingHarness.create(`/processing/${jobId}`);
    await settleHarness(harness, 6);
    return harness;
  }

  function text(harness: RouterTestingHarness): string {
    return harness.routeNativeElement?.textContent ?? "";
  }

  it("loads and renders the job by the route's :jobId param", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", {
            type: "generate-variant",
            status: "completed",
          }),
        ],
      }),
    );
    const harness = await render("job-1");

    expect(text(harness)).toContain("Generate variant");
    expect(text(harness)).toContain("Completed");
    expect(
      api.requests.some((r) => r.path === "/api/v1/processing-jobs/job-1"),
    ).toBe(true);
  });

  it("renders a not-found error state for a job that does not exist", async () => {
    configure(createStubApi());
    const harness = await render("missing");

    expect(
      harness.routeNativeElement?.querySelector('[data-testid="error-state"]')
        ?.textContent,
    ).toContain("Not found");
  });

  it("shows a human-readable summary and keeps raw job data collapsed by default", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", {
            type: "strip-metadata",
          }),
        ],
      }),
    );
    const harness = await render("job-1");

    expect(text(harness)).toContain("Strip metadata");
    expect(
      harness.routeNativeElement?.querySelector('[data-testid="job-raw-data"]'),
    ).toBeNull();
  });

  it("expands raw job data on request", async () => {
    configure(
      createStubApi({
        processingJobs: [processingJobFixture("job-1", "project-1")],
      }),
    );
    const harness = await render("job-1");

    clickTestId(harness.routeNativeElement!, "job-raw-toggle");
    await settleHarness(harness, 1);

    const raw = harness.routeNativeElement?.querySelector(
      '[data-testid="job-raw-data"]',
    );
    expect(raw).toBeTruthy();
    expect(raw?.textContent).toContain("generate-variant");
  });

  it("never puts a raw storage key in the primary summary for a delete-object job", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", {
            type: "delete-object",
            assetId: null,
            input: {
              type: "delete-object",
              storageKey: "derived/project-1/secret-key.jpg",
            },
          }),
        ],
      }),
    );
    const harness = await render("job-1");

    expect(text(harness)).not.toContain("secret-key");
  });

  it("shows the error message and code for a failed job", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", {
            status: "failed",
            errorCode: "provider_timeout",
            errorMessage: "The provider did not respond in time.",
          }),
        ],
      }),
    );
    const harness = await render("job-1");

    const error = harness.routeNativeElement?.querySelector(
      '[data-testid="job-error"]',
    );
    expect(error?.textContent).toContain(
      "The provider did not respond in time.",
    );
    expect(error?.textContent).toContain("provider_timeout");
  });

  it("retries a failed job and updates status in place", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", { status: "failed" }),
        ],
      }),
    );
    const harness = await render("job-1");

    clickTestId(harness.routeNativeElement!, "job-detail-retry");
    await settleHarness(harness, 2);

    expect(
      api.requests.some(
        (r) =>
          r.method === "POST" &&
          r.path === "/api/v1/processing-jobs/job-1/retry",
      ),
    ).toBe(true);
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="job-detail-retry"]',
      ),
    ).toBeNull();
  });

  it("cancels a queued job", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", { status: "queued" }),
        ],
      }),
    );
    const harness = await render("job-1");

    clickTestId(harness.routeNativeElement!, "job-detail-cancel");
    await settleHarness(harness, 2);

    expect(
      api.requests.some(
        (r) =>
          r.method === "POST" &&
          r.path === "/api/v1/processing-jobs/job-1/cancel",
      ),
    ).toBe(true);
    expect(
      harness.routeNativeElement?.querySelector(
        '[data-testid="job-detail-cancel"]',
      ),
    ).toBeNull();
  });

  it("polls a processing job in place until it reaches a terminal state", async () => {
    configure(
      createStubApi({
        processingJobs: [
          processingJobFixture("job-1", "project-1", { status: "processing" }),
        ],
      }),
    );
    const harness = await render("job-1");
    expect(text(harness)).toContain("Processing");

    api.state.processingJobs = api.state.processingJobs.map((job) =>
      job.id === "job-1" ? { ...job, status: "completed" as const } : job,
    );
    await new Promise((resolve) => setTimeout(resolve, 1300));
    harness.detectChanges();
    await settleHarness(harness, 1);

    expect(text(harness)).toContain("Completed");
  });
});
