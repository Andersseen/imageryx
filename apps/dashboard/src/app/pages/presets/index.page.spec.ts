import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { clickTestId, settle } from "../../testing/render";
import {
  createStubApi,
  presetFixture,
  projectFixture,
  type StubApi,
} from "../../testing/stub-client";
import PresetsPage from "./index.page";

describe("PresetsPage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [PresetsPage],
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
    const fixture = TestBed.createComponent(PresetsPage);
    await settle(fixture);
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? "";
  }

  const project = projectFixture("project-1", "Angular Lab", true);

  it("separates system presets from custom ones", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("sys-1", "Thumbnail", {
            projectId: "project-1",
            isSystem: true,
          }),
          presetFixture("custom-1", "My Preset", {
            projectId: "project-1",
            isSystem: false,
          }),
        ],
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="system-preset-list"] [data-testid="preset-card"]',
      ),
    ).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="custom-preset-list"] [data-testid="preset-card"]',
      ),
    ).toHaveLength(1);
  });

  it("never offers to delete a system preset", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("sys-1", "Thumbnail", {
            projectId: "project-1",
            isSystem: true,
          }),
        ],
      }),
    );
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid="preset-delete"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="preset-duplicate"]'),
    ).toBeTruthy();
  });

  it("shows a real empty state for custom presets with a way to create one", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("sys-1", "Thumbnail", {
            projectId: "project-1",
            isSystem: true,
          }),
        ],
      }),
    );
    const fixture = await render();

    expect(text(fixture)).toContain("No custom presets yet");
  });

  it("duplicates a preset and refreshes the list", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("sys-1", "Thumbnail", {
            projectId: "project-1",
            isSystem: true,
          }),
        ],
      }),
    );
    const fixture = await render();

    clickTestId(fixture.nativeElement, "preset-duplicate");
    await settle(fixture, 2);

    const created = api.requests.find(
      (r) => r.method === "POST" && r.path === "/api/v1/presets",
    );
    expect(created).toBeTruthy();
    expect((created?.body as { name: string }).name).toBe("Thumbnail (copy)");
  });

  it("prompts before deleting a custom preset", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("custom-1", "Mine", {
            projectId: "project-1",
            isSystem: false,
          }),
        ],
      }),
    );
    const fixture = await render();
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    clickTestId(fixture.nativeElement, "preset-delete");
    await settle(fixture, 1);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(api.requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  it("tells the user to select a project instead of showing an empty preset list", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("No project selected");
  });
});
