import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { clickTestId, settle } from "../testing/render";
import {
  assetFixture,
  createStubApi,
  projectFixture,
  type StubApi,
} from "../testing/stub-client";
import { parseTags, UploadDialog } from "./upload-dialog.component";

describe("parseTags", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseTags(" hero , marketing ,, ")).toEqual(["hero", "marketing"]);
  });

  it("de-duplicates", () => {
    expect(parseTags("hero, hero, Hero")).toEqual(["hero", "Hero"]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseTags("")).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
  });
});

describe("UploadDialog", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [UploadDialog],
      providers: [
        provideZonelessChangeDetection(),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
      ],
    });
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    document.body.innerHTML = "";
    TestBed.resetTestingModule();
  });

  async function render() {
    await TestBed.inject(ProjectContextService).ensureLoaded();
    const fixture = TestBed.createComponent(UploadDialog);
    await settle(fixture);
    return fixture;
  }

  function pngFile(name = "hero.png"): File {
    return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
      type: "image/png",
    });
  }

  /**
   * jsdom implements neither `DataTransfer` nor a writable `input.files`, so the `FileList` is
   * built by hand. It only needs the shape the component actually consumes (`Array.from`, which
   * uses `length` plus the iterator).
   */
  function fileList(files: File[]): FileList {
    return {
      ...files,
      length: files.length,
      item: (index: number) => files[index] ?? null,
      [Symbol.iterator]: () => files[Symbol.iterator](),
    } as unknown as FileList;
  }

  function selectFiles(files: File[]): void {
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="upload-file-input"]',
    );
    if (!input) throw new Error("file input not rendered");
    Object.defineProperty(input, "files", {
      value: fileList(files),
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("disables the trigger when no project is selected, rather than failing on click", async () => {
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    const button = fixture.nativeElement.querySelector<HTMLButtonElement>(
      '[data-testid="upload-trigger"] button',
    );
    expect(button?.disabled).toBe(true);
  });

  it("opens a labelled modal dialog naming the target project", async () => {
    configure(
      createStubApi({ projects: [projectFixture("p-1", "Angular Lab", true)] }),
    );
    const fixture = await render();

    clickTestId(fixture.nativeElement, "upload-trigger");
    await settle(fixture, 1);

    const dialog = document.body.querySelector('[data-testid="upload-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("Angular Lab");
  });

  it("keeps Upload disabled until a file is chosen", async () => {
    configure(
      createStubApi({ projects: [projectFixture("p-1", "Angular Lab", true)] }),
    );
    const fixture = await render();
    clickTestId(fixture.nativeElement, "upload-trigger");
    await settle(fixture, 1);

    const submit = () =>
      document.body.querySelector<HTMLButtonElement>(
        '[data-testid="upload-submit"] button',
      );
    expect(submit()?.disabled).toBe(true);

    selectFiles([pngFile()]);
    await settle(fixture, 1);

    expect(submit()?.disabled).toBe(false);
  });

  it("summarises the selection before uploading anything", async () => {
    configure(
      createStubApi({ projects: [projectFixture("p-1", "Angular Lab", true)] }),
    );
    const fixture = await render();
    clickTestId(fixture.nativeElement, "upload-trigger");
    await settle(fixture, 1);

    selectFiles([pngFile("one.png"), pngFile("two.png")]);
    await settle(fixture, 1);

    expect(
      document.body.querySelector('[data-testid="upload-selection-summary"]')
        ?.textContent,
    ).toContain("2 file(s) selected");
    // Nothing is sent until the user submits.
    expect(api.requests.some((r) => r.path === "/api/v1/assets/upload")).toBe(
      false,
    );
  });

  it("uploads the selected files to the selected project", async () => {
    configure(
      createStubApi({
        projects: [projectFixture("p-1", "Angular Lab", true)],
        assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
      }),
    );
    const fixture = await render();
    clickTestId(fixture.nativeElement, "upload-trigger");
    await settle(fixture, 1);

    selectFiles([pngFile()]);
    await settle(fixture, 1);
    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    const uploaded = api.requests.find(
      (r) => r.path === "/api/v1/assets/upload",
    );
    expect(uploaded?.method).toBe("POST");
    expect((uploaded?.body as Record<string, string>)["projectId"]).toBe("p-1");
    expect(
      document.body.querySelector('[data-testid="upload-queue"]'),
    ).toBeTruthy();
  });
});
