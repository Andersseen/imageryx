import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { clickTestId, settle, typeInto } from "../testing/render";
import {
  apiErrorResponse,
  createStubApi,
  folderFixture,
  projectFixture,
  type StubApi,
} from "../testing/stub-client";
import ProjectsPage from "./projects.page";

describe("ProjectsPage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [ProjectsPage],
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
  });

  async function render() {
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = TestBed.createComponent(ProjectsPage);
    await settle(fixture);
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? "";
  }

  it("renders a card per project with its real aggregate counts", async () => {
    configure(
      createStubApi({
        projects: [
          {
            ...projectFixture("p-1", "Angular Lab", true),
            assetCount: 12,
            presetCount: 6,
          },
          projectFixture("p-2", "Portfolio"),
        ],
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="project-card"]'),
    ).toHaveLength(2);
    expect(text(fixture)).toContain("Angular Lab");
    expect(text(fixture)).toContain("12");
    expect(text(fixture)).toContain("Default");
  });

  it("marks the selected project and offers Select on the others", async () => {
    configure(
      createStubApi({
        projects: [
          projectFixture("p-1", "Angular Lab", true),
          projectFixture("p-2", "Portfolio"),
        ],
      }),
    );
    const fixture = await render();

    expect(text(fixture)).toContain("Selected");
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="project-select"]'),
    ).toHaveLength(1);
  });

  it("shows an empty state with a create action when there are no projects", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("No projects yet");
    expect(
      fixture.nativeElement.querySelector('[data-testid="empty-state"]'),
    ).toBeTruthy();
  });

  it("shows an error state when the project list fails to load", async () => {
    const stub = createStubApi();
    stub.override("GET", /\/v1\/projects$/, () =>
      apiErrorResponse(500, "server_error", "The API is unavailable."),
    );
    configure(stub);
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid="error-state"]')
        ?.textContent,
    ).toContain("The API is unavailable.");
  });

  it("renders the folders and tags of the selected project", async () => {
    configure(
      createStubApi({
        projects: [projectFixture("p-1", "Angular Lab", true)],
        folders: [folderFixture("f-1", "Courses", "courses")],
        tags: ["marketing"],
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid="folder-list"]'),
    ).toBeTruthy();
    expect(text(fixture)).toContain("courses");
    expect(text(fixture)).toContain("marketing");
  });

  it("creates a folder against the selected project", async () => {
    configure(
      createStubApi({
        projects: [projectFixture("p-1", "Angular Lab", true)],
        folders: [],
      }),
    );
    const fixture = await render();

    typeInto(fixture.nativeElement, "folder-name-input", "courses");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "folder-create");
    await settle(fixture, 2);

    const created = api.requests.find(
      (r) => r.method === "POST" && r.path === "/api/v1/projects/p-1/folders",
    );
    expect(created).toBeTruthy();
    expect((created?.body as { name: string }).name).toBe("courses");
  });

  it("creates a tag against the selected project", async () => {
    configure(
      createStubApi({
        projects: [projectFixture("p-1", "Angular Lab", true)],
        tags: [],
      }),
    );
    const fixture = await render();

    typeInto(fixture.nativeElement, "tag-name-input", "marketing");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "tag-create");
    await settle(fixture, 2);

    expect(
      api.requests.some(
        (r) => r.method === "POST" && r.path === "/api/v1/projects/p-1/tags",
      ),
    ).toBe(true);
  });

  it("prompts before deleting a project and does nothing when cancelled", async () => {
    configure(
      createStubApi({ projects: [projectFixture("p-1", "Angular Lab", true)] }),
    );
    const fixture = await render();
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    clickTestId(fixture.nativeElement, "project-delete");
    await settle(fixture, 1);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(api.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("never sends the destructive cascade flag when a delete is confirmed", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
    });
    stub.override(
      "DELETE",
      /\/v1\/projects\/p-1$/,
      () => new Response(null, { status: 204 }),
    );
    configure(stub);
    const fixture = await render();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    clickTestId(fixture.nativeElement, "project-delete");
    await settle(fixture, 2);

    const deleteRequest = api.requests.find((r) => r.method === "DELETE");
    expect(deleteRequest).toBeTruthy();
    // Cascade would silently delete every asset in the project; the dashboard must never send it.
    expect(deleteRequest?.query.get("cascade")).toBeNull();
  });

  it("reports a refused delete rather than retrying it destructively", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
    });
    stub.override("DELETE", /\/v1\/projects\/p-1$/, () =>
      apiErrorResponse(
        409,
        "project_has_active_assets",
        'Project "p-1" has 3 active asset(s). Pass ?cascade=true to delete anyway.',
      ),
    );
    configure(stub);
    const fixture = await render();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    clickTestId(fixture.nativeElement, "project-delete");
    await settle(fixture, 2);

    // Exactly one attempt: no automatic retry with cascade=true.
    expect(api.requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
    // The project is still listed, because it was not deleted.
    expect(text(fixture)).toContain("Angular Lab");
  });

  it("creates a project through the form dialog and selects it", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();
    const context = TestBed.inject(ProjectContextService);

    clickTestId(fixture.nativeElement, "project-create");
    await settle(fixture, 1);

    // The dialog renders into the document body, not the component's own subtree.
    typeInto(document.body, "project-name-input", "Angular Lab");
    await settle(fixture, 1);
    clickTestId(document.body, "project-form-submit");
    await settle(fixture, 2);

    const created = api.requests.find(
      (r) => r.method === "POST" && r.path === "/api/v1/projects",
    );
    expect(created).toBeTruthy();
    const body = created?.body as {
      name: string;
      slug: string;
      withSystemPresets: boolean;
    };
    expect(body.name).toBe("Angular Lab");
    // The slug is derived from the name until the user overrides it.
    expect(body.slug).toBe("angular-lab");
    expect(body.withSystemPresets).toBe(true);
    expect(context.projects().some((p) => p.name === "Angular Lab")).toBe(true);
  });

  it("blocks submission and reports the field error when the name is blank", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    clickTestId(fixture.nativeElement, "project-create");
    await settle(fixture, 1);
    clickTestId(document.body, "project-form-submit");
    await settle(fixture, 1);

    expect(
      api.requests.some(
        (r) => r.method === "POST" && r.path === "/api/v1/projects",
      ),
    ).toBe(false);
    expect(document.body.textContent).toContain("A project name is required.");
  });
});
