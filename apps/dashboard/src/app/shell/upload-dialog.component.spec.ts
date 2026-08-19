import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotificationService } from "../core/notifications/notification.service";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { clickTestId, settle, typeInto } from "../testing/render";
import {
  apiErrorResponse,
  assetFixture,
  createStubApi,
  folderFixture,
  projectFixture,
  type StubApi,
} from "../testing/stub-client";
import { UploadDialog } from "./upload-dialog.component";

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

  function uploadAccepted(overrides: Record<string, unknown> = {}): Response {
    return new Response(
      JSON.stringify({
        asset: assetFixture("a-1", "Hero"),
        processingJobId: "job-1",
        processingDispatch: { mode: "queue", dispatched: true },
        duplicateCandidates: [],
        securityWarnings: [],
        ...overrides,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  }

  function setSelect(testId: string, value: string): void {
    const select = document.body.querySelector<HTMLSelectElement>(
      `select[data-testid="${testId}"]`,
    );
    if (!select) throw new Error(`No select rendered for ${testId}`);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function openWithFile(
    stub: StubApi,
    file = pngFile(),
  ): Promise<ReturnType<typeof TestBed.createComponent<UploadDialog>>> {
    configure(stub);
    const fixture = await render();
    clickTestId(fixture.nativeElement, "upload-trigger");
    await settle(fixture, 1);
    selectFiles([file]);
    await settle(fixture, 1);
    return fixture;
  }

  /**
   * The failure the dialog exists to report: a real API rejection has to reach
   * the screen as the API's own sentence, next to the file it happened to —
   * not as a silent no-op, and not as a generic "something went wrong".
   */
  it("shows a rejected upload as Failed, with the API's own message and a toast naming the count", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
    });
    stub.override("POST", /\/v1\/assets\/upload$/, () =>
      apiErrorResponse(
        415,
        "unsupported_media_type",
        "The uploaded file failed MIME type, extension, or signature validation.",
      ),
    );
    const fixture = await openWithFile(stub);

    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    const queue = document.body.querySelector('[data-testid="upload-queue"]');
    expect(queue?.textContent).toContain("Failed");
    expect(queue?.textContent).toContain(
      "The uploaded file failed MIME type, extension, or signature validation.",
    );

    const toasts = TestBed.inject(NotificationService).notifications();
    expect(toasts[0]?.tone).toBe("error");
    expect(toasts[0]?.message).toContain("1 of 1 upload(s) failed");
  });

  it("keeps the dialog open after a failure, so the reason stays readable", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
    });
    stub.override("POST", /\/v1\/assets\/upload$/, () =>
      apiErrorResponse(500, "internal_error", "An unexpected error occurred."),
    );
    const fixture = await openWithFile(stub);

    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    expect(
      document.body.querySelector('[data-testid="upload-dialog"]'),
    ).toBeTruthy();
  });

  it("reports a successful upload without claiming processing has finished", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
      assets: [assetFixture("a-1", "Hero", { processingStatus: "pending" })],
    });
    const fixture = await openWithFile(stub);

    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    const toasts = TestBed.inject(NotificationService).notifications();
    expect(toasts[0]?.tone).toBe("success");
    expect(toasts[0]?.message).toContain("Processing runs in the background");
  });

  it("sends the folder, visibility and tags the user chose, not the defaults", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
      folders: [folderFixture("f-1", "courses")],
      assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
    });
    const fixture = await openWithFile(stub);

    setSelect("upload-folder", "f-1");
    setSelect("upload-visibility", "private");
    typeInto(document.body, "upload-tags", "hero, marketing");
    await settle(fixture, 1);

    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    const uploaded = api.requests.find(
      (r) => r.path === "/api/v1/assets/upload",
    );
    const body = uploaded?.body as Record<string, string>;
    expect(body["folderId"]).toBe("f-1");
    expect(body["visibility"]).toBe("private");
    // One field per tag, which is the shape api-worker parses into an array.
    expect(uploaded?.formFields?.["tags"]).toEqual(["hero", "marketing"]);
  });

  it("turns the original-download switch off when the user does", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
      assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
    });
    const fixture = await openWithFile(stub);

    // Defaults on, so one click is the "off" the request should carry.
    clickTestId(document.body, "upload-download-original");
    await settle(fixture, 1);
    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    const body = api.requests.find((r) => r.path === "/api/v1/assets/upload")
      ?.body as Record<string, string>;
    expect(body["downloadOriginalEnabled"]).toBe("false");
  });

  it("surfaces an SVG's security warning and a duplicate-content notice alongside the file", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
      assets: [assetFixture("a-1", "Hero", { processingStatus: "pending" })],
    });
    stub.override("POST", /\/v1\/assets\/upload$/, () =>
      uploadAccepted({
        duplicateCandidates: [{ assetId: "a-0", path: "existing/logo" }],
        securityWarnings: ["svg-detected-untrusted-content"],
      }),
    );
    const fixture = await openWithFile(
      stub,
      new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "logo.svg", {
        type: "image/svg+xml",
      }),
    );

    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);

    const queue = document.body.querySelector('[data-testid="upload-queue"]');
    expect(queue?.textContent).toContain("svg-detected-untrusted-content");
    expect(queue?.textContent).toContain("existing/logo");
  });

  it("clears a previous run's results when the dialog is reopened", async () => {
    const stub = createStubApi({
      projects: [projectFixture("p-1", "Angular Lab", true)],
      assets: [assetFixture("a-1", "Hero", { processingStatus: "pending" })],
    });
    const fixture = await openWithFile(stub);

    clickTestId(document.body, "upload-submit");
    await settle(fixture, 2);
    expect(
      document.body.querySelector('[data-testid="upload-queue"]'),
    ).toBeTruthy();

    clickTestId(document.body, "upload-close");
    await settle(fixture, 1);
    clickTestId(fixture.nativeElement, "upload-trigger");
    await settle(fixture, 1);

    expect(
      document.body.querySelector('[data-testid="upload-queue"]'),
    ).toBeNull();
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
