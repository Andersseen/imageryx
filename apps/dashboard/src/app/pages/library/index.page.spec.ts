import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { settle } from "../../testing/render";
import {
  apiErrorResponse,
  assetFixture,
  createStubApi,
  projectFixture,
  type StubApi,
} from "../../testing/stub-client";
import LibraryPage from "./index.page";

describe("LibraryPage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [LibraryPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: "library", component: LibraryPage }]),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
      ],
    });
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  /**
   * Renders and settles. Several async hops chain here — project bootstrap, the URL-driven query
   * effect, then the list fetch — and each one can schedule the next, so this drains repeatedly
   * rather than assuming a fixed number of cycles.
   *
   * Uses the shared `settle()` rather than a local drain loop: this used to spin on
   * `detectChanges()`/`whenStable()` alone, which only drains *microtasks*. That was enough until
   * Volt UI 1.0, whose controls defer their first measurement to `afterNextRender`, putting a
   * macrotask in the middle of the chain — the page then stayed on "Loading assets…" forever and
   * every assertion below it failed. `settle()` yields to the macrotask queue between passes,
   * which is exactly the case its own doc comment describes.
   */
  async function render(queryParams?: Record<string, string>) {
    await TestBed.inject(ProjectContextService).ensureLoaded();
    if (queryParams) {
      await TestBed.inject(Router).navigate(["/library"], { queryParams });
    }
    const fixture = TestBed.createComponent(LibraryPage);
    await settle(fixture, 5);
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? "";
  }

  const defaultProjects = [projectFixture("project-1", "Angular Lab", true)];

  it("renders a card per asset in grid view", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero"), assetFixture("a-2", "Cover")],
      }),
    );
    const fixture = await render();

    const cards = fixture.nativeElement.querySelectorAll(
      '[data-testid="asset-card"]',
    );
    expect(cards).toHaveLength(2);
    expect(text(fixture)).toContain("Hero");
    expect(text(fixture)).toContain("Cover");
  });

  it("scopes the list request to the selected project", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero")],
      }),
    );
    await render();

    const listRequest = api.requests.find((r) => r.path === "/api/v1/assets");
    expect(listRequest?.query.get("projectId")).toBe("project-1");
    expect(listRequest?.query.get("deleted")).toBe("active");
  });

  it("shows a distinct empty state when the project genuinely has no assets", async () => {
    configure(createStubApi({ projects: defaultProjects, assets: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("No assets yet");
    expect(text(fixture)).not.toContain("No assets match these filters");
  });

  it("shows a filter-specific empty state, with a way out, when filters exclude everything", async () => {
    configure(createStubApi({ projects: defaultProjects, assets: [] }));
    const fixture = await render({ q: "nothing-matches" });

    expect(text(fixture)).toContain("No assets match these filters");
    expect(
      fixture.nativeElement.querySelector('[data-testid="clear-filters"]'),
    ).toBeTruthy();
  });

  it("reads filters from the URL and forwards them to the API", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero")],
      }),
    );
    await render({
      q: "hero",
      status: "failed",
      visibility: "private",
      sort: "name",
      dir: "asc",
    });

    const listRequest = api.requests
      .filter((r) => r.path === "/api/v1/assets")
      .at(-1);
    expect(listRequest?.query.get("search")).toBe("hero");
    expect(listRequest?.query.get("processingStatus")).toBe("failed");
    expect(listRequest?.query.get("visibility")).toBe("private");
    expect(listRequest?.query.get("sortField")).toBe("name");
    expect(listRequest?.query.get("sortDirection")).toBe("asc");
  });

  it("renders a retryable error state when the list request fails", async () => {
    const stub = createStubApi({ projects: defaultProjects });
    stub.override("GET", /\/v1\/assets$/, () =>
      apiErrorResponse(500, "server_error", "The database is unavailable."),
    );
    configure(stub);
    const fixture = await render();

    const error = fixture.nativeElement.querySelector(
      '[data-testid="error-state"]',
    );
    expect(error?.textContent).toContain("The database is unavailable.");
    // 5xx is retryable, so the retry affordance must be present.
    expect(error?.textContent).toContain("Try again");
  });

  it("does not offer a retry for an error that retrying cannot fix", async () => {
    const stub = createStubApi({ projects: defaultProjects });
    stub.override("GET", /\/v1\/assets$/, () =>
      apiErrorResponse(404, "not_found", "Project not found."),
    );
    configure(stub);
    const fixture = await render();

    const error = fixture.nativeElement.querySelector(
      '[data-testid="error-state"]',
    );
    expect(error?.textContent).toContain("Project not found.");
    expect(error?.textContent).not.toContain("Try again");
  });

  it("switches to a table when the view query param asks for it", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero")],
      }),
    );
    const fixture = await render({ view: "table" });

    expect(
      fixture.nativeElement.querySelector('[data-testid="asset-table"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="asset-grid"]'),
    ).toBeNull();
  });

  it("prompts before deleting and does nothing when the user cancels", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero")],
      }),
    );
    const fixture = await render();
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    fixture.nativeElement
      .querySelector<HTMLElement>(
        '[data-testid="asset-delete"] button, [data-testid="asset-delete"]',
      )
      ?.click();
    await fixture.whenStable();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(api.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("deletes and refreshes once the user confirms", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero")],
      }),
    );
    const fixture = await render();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    fixture.nativeElement
      .querySelector<HTMLElement>(
        '[data-testid="asset-delete"] button, [data-testid="asset-delete"]',
      )
      ?.click();
    await fixture.whenStable();
    await fixture.whenStable();

    expect(
      api.requests.some(
        (r) => r.method === "DELETE" && r.path === "/api/v1/assets/a-1",
      ),
    ).toBe(true);
    // A refetch follows the mutation rather than the row being removed optimistically.
    expect(
      api.requests.filter((r) => r.path === "/api/v1/assets").length,
    ).toBeGreaterThan(1);
  });

  it("tells the user to pick a project instead of showing an empty library", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("No project selected");
    expect(text(fixture)).toContain("Go to Projects");
  });

  it("reports total assets, not just the number on this page", async () => {
    configure(
      createStubApi({
        projects: defaultProjects,
        assets: [assetFixture("a-1", "Hero")],
        assetTotal: 57,
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid="pager"]')?.textContent,
    ).toContain("of 57 assets");
  });
});
