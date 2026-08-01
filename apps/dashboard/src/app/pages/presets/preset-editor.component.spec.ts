import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextService } from "../../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../../core/sdk/imageryx-client.token";
import { clickTestId, settle, typeInto } from "../../testing/render";
import {
  apiErrorResponse,
  createStubApi,
  presetFixture,
  projectFixture,
  type StubApi,
} from "../../testing/stub-client";
import { PresetEditor } from "./preset-editor.component";

describe("PresetEditor", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [PresetEditor],
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

  async function render(presetId: string | null) {
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = TestBed.createComponent(PresetEditor);
    fixture.componentRef.setInput("presetId", presetId);
    await settle(fixture, 5);
    return fixture;
  }

  const project = projectFixture("project-1", "Angular Lab", true);

  it("creates a preset from the resize defaults and navigates to it", async () => {
    configure(createStubApi({ projects: [project] }));
    const fixture = await render(null);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), "navigate");

    typeInto(fixture.nativeElement, "preset-name-input", "Card Thumbnail");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "preset-save");
    await settle(fixture, 2);

    const created = api.requests.find(
      (r) => r.method === "POST" && r.path === "/api/v1/presets",
    );
    expect(created).toBeTruthy();
    const body = created?.body as {
      name: string;
      slug: string;
      operations: unknown[];
    };
    expect(body.name).toBe("Card Thumbnail");
    // Slug auto-derives from the name until the user overrides it.
    expect(body.slug).toBe("card-thumbnail");
    expect(body.operations).toEqual([
      {
        type: "resize",
        width: 800,
        height: undefined,
        fit: "cover",
        position: undefined,
        withoutEnlargement: true,
      },
    ]);
    expect(navigateSpy).toHaveBeenCalledWith(
      ["/presets", expect.any(String)],
      expect.objectContaining({ replaceUrl: true }),
    );
  });

  it("shows crop controls only once crop is enabled", async () => {
    configure(createStubApi({ projects: [project] }));
    const fixture = await render(null);

    expect(fixture.nativeElement.querySelector("#crop-x")).toBeNull();

    const cropSwitch = fixture.nativeElement.querySelector(
      '[data-testid="crop-enabled-switch"]',
    );
    cropSwitch?.querySelector<HTMLElement>("button")?.click();
    await settle(fixture, 1);

    expect(fixture.nativeElement.querySelector("#crop-x")).toBeTruthy();
  });

  it("flags a Cloudflare-incompatible operation in the compatibility panel", async () => {
    configure(createStubApi({ projects: [project] }));
    const fixture = await render(null);

    const grayscaleSwitch = fixture.nativeElement.querySelector(
      '[data-testid="grayscale-switch"]',
    );
    grayscaleSwitch?.querySelector<HTMLElement>("button")?.click();
    await settle(fixture, 1);

    const panel = fixture.nativeElement.querySelector(
      '[data-testid="provider-compatibility"]',
    );
    expect(panel?.textContent).toContain("Cloudflare:");
    expect(panel?.textContent).toContain("unsupported: grayscale");
    // Cloudinary and the mock provider both support the full operation set.
    expect(panel?.textContent).toContain("Cloudinary: supported");
  });

  it("loads and displays an existing custom preset for editing", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("preset-1", "Hero", {
            projectId: "project-1",
            operations: [
              { type: "resize", width: 1920, height: 1080, fit: "cover" },
            ],
            outputFormat: "webp",
            quality: 82,
          }),
        ],
      }),
    );
    const fixture = await render("preset-1");

    expect(
      fixture.nativeElement.querySelector<HTMLInputElement>(
        "#preset-name input",
      )?.value,
    ).toBe("Hero");
    // The slug cannot be changed once a preset exists.
    expect(
      fixture.nativeElement.querySelector<HTMLInputElement>(
        "#preset-slug input",
      )?.disabled,
    ).toBe(true);
  });

  it("disables every field and hides Save for a system preset", async () => {
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
    const fixture = await render("sys-1");

    expect(
      fixture.nativeElement.querySelector<HTMLInputElement>(
        "#preset-name input",
      )?.disabled,
    ).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="preset-save"]'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      "cannot be edited or deleted",
    );
  });

  it("runs a real preview against the preview endpoint and labels it simulated", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("preset-1", "Hero", { projectId: "project-1" }),
        ],
      }),
    );
    const fixture = await render("preset-1");

    clickTestId(fixture.nativeElement, "preset-preview-run");
    await settle(fixture, 2);

    expect(
      api.requests.some((r) => r.path === "/api/v1/presets/preset-1/preview"),
    ).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      "Simulated transformation",
    );
  });

  it("does not offer preview for an unsaved new preset", async () => {
    configure(createStubApi({ projects: [project] }));
    const fixture = await render(null);

    expect(
      fixture.nativeElement.querySelector('[data-testid="preset-preview-run"]'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      "Save this preset to preview it",
    );
  });

  it("saves changes to an existing preset without creating a duplicate", async () => {
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("preset-1", "Hero", { projectId: "project-1" }),
        ],
      }),
    );
    const fixture = await render("preset-1");

    typeInto(fixture.nativeElement, "preset-name-input", "Hero Updated");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "preset-save");
    await settle(fixture, 2);

    expect(
      api.requests.some(
        (r) => r.method === "POST" && r.path === "/api/v1/presets",
      ),
    ).toBe(false);
    const updated = api.requests.find(
      (r) => r.method === "PATCH" && r.path === "/api/v1/presets/preset-1",
    );
    expect((updated?.body as { name: string }).name).toBe("Hero Updated");
  });

  it("offers the existing preset instead of creating a duplicate on an equivalence conflict", async () => {
    const stub = createStubApi({ projects: [project] });
    stub.override("POST", /\/v1\/presets$/, () =>
      apiErrorResponse(
        409,
        "equivalent_preset_exists",
        'An equivalent preset already exists: "Thumbnail" (thumbnail).',
      ),
    );
    configure(stub);
    const fixture = await render(null);

    typeInto(fixture.nativeElement, "preset-name-input", "Duplicate Idea");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "preset-save");
    await settle(fixture, 2);

    expect(fixture.nativeElement.textContent).toContain("Thumbnail");
    expect(
      fixture.nativeElement.querySelector('a[href*="/presets/"]'),
    ).toBeTruthy();
  });

  it("shows real dirty-state feedback once the form changes", async () => {
    configure(createStubApi({ projects: [project] }));
    const fixture = await render(null);

    expect(fixture.nativeElement.textContent).not.toContain("Unsaved changes");
    typeInto(fixture.nativeElement, "preset-name-input", "Something New");
    await settle(fixture, 1);
    expect(fixture.nativeElement.textContent).toContain("Unsaved changes");
  });
});
