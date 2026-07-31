import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import {
  apiErrorResponse,
  createStubApi,
  projectFixture,
  type StubApi,
} from "../testing/stub-client";
import { ProjectSwitcher } from "./project-switcher.component";

describe("ProjectSwitcher", () => {
  function configure(api: StubApi) {
    TestBed.configureTestingModule({
      imports: [ProjectSwitcher],
      providers: [
        provideZonelessChangeDetection(),
        { provide: IMAGERYX_CLIENT, useValue: api.client },
      ],
    });
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  async function render() {
    const fixture = TestBed.createComponent(ProjectSwitcher);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it("shows the selected project's name once loaded", async () => {
    configure(
      createStubApi({
        projects: [
          projectFixture("a", "Alpha"),
          projectFixture("b", "Beta", true),
        ],
      }),
    );
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = await render();

    const trigger = fixture.nativeElement.querySelector<HTMLElement>(
      '[data-testid="project-switcher-trigger"]',
    );
    // "Beta" is flagged default, so it wins when nothing was previously selected.
    expect(trigger?.textContent).toContain("Beta");
  });

  it("shows a real empty state rather than a broken picker when there are no projects", async () => {
    configure(createStubApi({ projects: [] }));
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = await render();

    expect(fixture.nativeElement.textContent).toContain("No projects yet");
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="project-switcher-trigger"]',
      ),
    ).toBeNull();
  });

  it("surfaces a load failure instead of pretending the list is empty", async () => {
    const api = createStubApi();
    api.override("GET", /\/v1\/projects$/, () =>
      apiErrorResponse(500, "server_error", "Something failed."),
    );
    configure(api);
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = await render();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("The API returned an error");
    expect(fixture.nativeElement.textContent).not.toContain("No projects yet");
  });

  it("restores the previously selected project across a reload", async () => {
    localStorage.setItem("imageryx.selectedProjectId", "c");
    configure(
      createStubApi({
        projects: [
          projectFixture("a", "Alpha", true),
          projectFixture("b", "Beta"),
          projectFixture("c", "Gamma"),
        ],
      }),
    );
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = await render();

    // The remembered project beats the default-flagged one.
    const trigger = fixture.nativeElement.querySelector<HTMLElement>(
      '[data-testid="project-switcher-trigger"]',
    );
    expect(trigger?.textContent).toContain("Gamma");
  });

  it("switching projects updates the shared selection and reloads its folders and tags", async () => {
    const api = createStubApi({
      projects: [projectFixture("a", "Alpha"), projectFixture("b", "Beta")],
    });
    configure(api);
    const context = TestBed.inject(ProjectContextService);
    await context.ensureLoaded();
    await render();

    expect(context.selectedProjectId()).toBe("a");

    context.select("b");
    await Promise.resolve();

    expect(context.selectedProject()?.name).toBe("Beta");
    expect(
      api.requests.some((r) => r.path === "/api/v1/projects/b/folders"),
    ).toBe(true);
    expect(api.requests.some((r) => r.path === "/api/v1/projects/b/tags")).toBe(
      true,
    );
  });

  it("ignores a request to select a project that does not exist", async () => {
    configure(createStubApi({ projects: [projectFixture("a", "Alpha")] }));
    const context = TestBed.inject(ProjectContextService);
    await context.ensureLoaded();
    await render();

    context.select("does-not-exist");
    expect(context.selectedProjectId()).toBe("a");
  });
});
