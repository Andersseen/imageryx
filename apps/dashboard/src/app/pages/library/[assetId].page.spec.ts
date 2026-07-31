import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { clickTestId, settleHarness } from "../../testing/render";
import {
  apiErrorResponse,
  assetDetailsFixture,
  assetFixture,
  createStubApi,
  presetFixture,
  projectFixture,
  type StubApi,
} from "../../testing/stub-client";
import AssetWorkspacePage from "./[assetId].page";

describe("AssetWorkspacePage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      teardown: { destroyAfterEach: true },
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "library/:assetId", component: AssetWorkspacePage },
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

  async function render(assetId = "a-1", query = "") {
    const harness = await RouterTestingHarness.create(
      `/library/${assetId}${query}`,
    );
    await settleHarness(harness, 6);
    return harness;
  }

  function text(harness: RouterTestingHarness): string {
    return harness.routeNativeElement?.textContent ?? "";
  }

  it("loads and renders the asset by the route's :assetId param", async () => {
    const base = assetFixture("a-1", "Hero");
    configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    const harness = await render("a-1");

    expect(text(harness)).toContain("Hero");
    expect(api.requests.some((r) => r.path === "/api/v1/assets/a-1")).toBe(
      true,
    );
  });

  it("renders a not-found error state for an asset that does not exist", async () => {
    configure(createStubApi());
    const harness = await render("missing");

    expect(
      harness.routeNativeElement?.querySelector('[data-testid="error-state"]')
        ?.textContent,
    ).toContain("Not found");
  });

  it("shows a deleted banner without hiding the rest of the workspace", async () => {
    const base = assetFixture("a-1", "Hero");
    const deleted = assetDetailsFixture(base, {
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    configure(
      createStubApi({ assets: [base], assetDetails: { "a-1": deleted } }),
    );
    const harness = await render("a-1");

    expect(text(harness)).toContain("This asset is deleted");
    // The tabs are still there — a deleted asset can still be inspected, just not delivered.
    expect(
      harness.routeNativeElement?.querySelector("volt-tabs-list"),
    ).toBeTruthy();
  });

  it("switches tabs by navigating the URL's tab query param", async () => {
    const base = assetFixture("a-1", "Hero");
    configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    const harness = await render("a-1");
    const root = harness.routeNativeElement!;

    expect(TestBed.inject(Router).url).not.toContain("tab=");

    clickTestId(root, "asset-header-actions");
    await settleHarness(harness, 1);
    // "Copy logical path" is the first item, "Rename, move or edit tags…" is the second.
    (
      document.body.querySelectorAll("volt-dropdown-menu-item")[1] as
        | HTMLElement
        | undefined
    )?.click();
    await settleHarness(harness, 1);

    expect(TestBed.inject(Router).url).toContain("tab=settings");
  });

  it("copies the logical path from the header", async () => {
    const base = assetFixture("a-1", "Hero", { path: "courses/hero" });
    configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    const harness = await render("a-1");
    const root = harness.routeNativeElement!;

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    clickTestId(root, "asset-header-actions");
    await settleHarness(harness, 1);
    (
      document.body.querySelectorAll("volt-dropdown-menu-item")[0] as
        | HTMLElement
        | undefined
    )?.click();
    await settleHarness(harness, 1);

    expect(writeText).toHaveBeenCalledWith("courses/hero");
  });

  it("deletes the asset, confirms first, and navigates back to the library on success", async () => {
    const base = assetFixture("a-1", "Hero");
    configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    const harness = await render("a-1");
    const root = harness.routeNativeElement!;
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), "navigate");

    clickTestId(root, "asset-header-actions");
    await settleHarness(harness, 1);
    (
      document.body.querySelector(
        '[data-testid="menu-delete"]',
      ) as HTMLElement | null
    )?.click();
    await settleHarness(harness, 2);

    expect(
      api.requests.some(
        (r) => r.method === "DELETE" && r.path === "/api/v1/assets/a-1",
      ),
    ).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith(["/library"]);
  });

  it("does nothing when the delete confirmation is cancelled", async () => {
    const base = assetFixture("a-1", "Hero");
    configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    const harness = await render("a-1");
    const root = harness.routeNativeElement!;
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    clickTestId(root, "asset-header-actions");
    await settleHarness(harness, 1);
    (
      document.body.querySelector(
        '[data-testid="menu-delete"]',
      ) as HTMLElement | null
    )?.click();
    await settleHarness(harness, 1);

    expect(api.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("shows a restore action for a deleted asset instead of delete", async () => {
    const base = assetFixture("a-1", "Hero");
    const deleted = assetDetailsFixture(base, {
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    configure(
      createStubApi({ assets: [base], assetDetails: { "a-1": deleted } }),
    );
    const harness = await render("a-1");
    const root = harness.routeNativeElement!;

    clickTestId(root, "asset-header-actions");
    await settleHarness(harness, 1);

    expect(
      document.body.querySelector('[data-testid="menu-restore"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-testid="menu-delete"]'),
    ).toBeNull();
  });

  it("syncs the shared project context to the asset's own project on a deep link", async () => {
    const base = assetFixture("a-1", "Hero", { projectId: "project-2" });
    configure(
      createStubApi({
        projects: [
          projectFixture("project-1", "Alpha", true),
          projectFixture("project-2", "Beta"),
        ],
        assets: [base],
        assetDetails: {
          "a-1": assetDetailsFixture(base, { projectId: "project-2" }),
        },
      }),
    );
    await render("a-1");

    expect(TestBed.inject(ProjectContextService).selectedProjectId()).toBe(
      "project-2",
    );
  });

  it("runs variant generation end to end and lands on the ready state", async () => {
    // Real timers, not fake ones: `settleHarness` yields via a real `setTimeout(0)` to drain
    // Angular's async chain, which fake timers would freeze right along with the service's own
    // poll delay — the two are not separable here. The service's poll interval is a fixed
    // 1200ms, so this test genuinely waits for it rather than simulating time passing.
    const base = assetFixture("a-1", "Hero");
    const preset = presetFixture("preset-1", "Thumbnail");
    const details = assetDetailsFixture(base, {
      presets: [preset],
      variants: [],
    });
    configure(
      createStubApi({ assets: [base], assetDetails: { "a-1": details } }),
    );
    // Deep-links straight to the Variants tab via the URL — the same "URL is the tab state"
    // mechanism the header's "Rename, move or edit tags…" action uses, rather than simulating a
    // raw click on ng-primitives' roving-focus tab button, which needs more than `.click()`.
    const harness = await render("a-1", "?tab=variants");
    // Tab content renders in the harness's own root fixture, not document.body — unlike an
    // overlay-portalled dialog or dropdown menu, it is regular template content.
    const root = harness.routeNativeElement!;

    const select = root.querySelector<HTMLSelectElement>(
      '[data-testid="variant-preset-select"] select',
    );
    expect(select).toBeTruthy();
    select!.value = "preset-1";
    select!.dispatchEvent(new Event("change", { bubbles: true }));
    await settleHarness(harness, 1);

    clickTestId(root, "variant-generate-submit");
    await settleHarness(harness, 2);

    const jobId = api.state.processingJobs[0]?.id;
    expect(jobId).toBeTruthy();
    api.state.processingJobs = api.state.processingJobs.map((j) =>
      j.id === jobId ? { ...j, status: "completed" as const } : j,
    );
    api.state.assetDetails["a-1"] = {
      ...api.state.assetDetails["a-1"],
      variants: api.state.assetDetails["a-1"].variants.map((v) => ({
        ...v,
        status: "ready" as const,
      })),
    };

    await new Promise((resolve) => setTimeout(resolve, 1300));
    await settleHarness(harness, 3);

    expect(root.textContent).toContain("Ready");
  }, 10_000);

  it("shows a retryable error and recovers on retry", async () => {
    const stub = createStubApi();
    let failedOnce = false;
    stub.override("GET", /\/v1\/assets\/a-1$/, () => {
      if (!failedOnce) {
        failedOnce = true;
        return apiErrorResponse(
          500,
          "server_error",
          "The database is unavailable.",
        );
      }
      const base = assetFixture("a-1", "Hero");
      return new Response(JSON.stringify(assetDetailsFixture(base)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    configure(stub);
    const harness = await render("a-1");
    const root = harness.routeNativeElement!;

    expect(root.querySelector('[data-testid="error-state"]')).toBeTruthy();
    root
      .querySelector<HTMLButtonElement>('[data-testid="error-state"] button')
      ?.click();
    await settleHarness(harness, 3);

    expect(text(harness)).toContain("Hero");
  });
});
