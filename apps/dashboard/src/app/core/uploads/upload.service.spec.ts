import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGERYX_CLIENT } from "../sdk/imageryx-client.token";
import {
  apiErrorResponse,
  assetFixture,
  createStubApi,
  type StubApi,
} from "../../testing/stub-client";
import { UploadService } from "./upload.service";

function pngFile(name = "hero.png"): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
  });
}

const request = {
  projectId: "project-1",
  folderId: null,
  visibility: "public" as const,
  tags: [],
  downloadOriginalEnabled: true,
};

describe("UploadService", () => {
  let api: StubApi;

  function configure(stub: StubApi): UploadService {
    api = stub;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
      ],
    });
    return TestBed.inject(UploadService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("sends one multipart request per file, with the chosen options", async () => {
    const uploads = configure(
      createStubApi({
        assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
      }),
    );

    await uploads.upload([pngFile("one.png"), pngFile("two.png")], {
      ...request,
      folderId: "folder-1",
      visibility: "private",
      tags: ["hero"],
    });

    const uploadRequests = api.requests.filter(
      (r) => r.path === "/api/v1/assets/upload",
    );
    expect(uploadRequests).toHaveLength(2);
    const body = uploadRequests[0]?.body as Record<string, string>;
    expect(body["projectId"]).toBe("project-1");
    expect(body["folderId"]).toBe("folder-1");
    expect(body["visibility"]).toBe("private");
    expect(body["downloadOriginalEnabled"]).toBe("true");
  });

  it("moves a file through uploading and into processing", async () => {
    const uploads = configure(
      createStubApi({
        assets: [assetFixture("a-1", "Hero", { processingStatus: "pending" })],
      }),
    );

    await uploads.upload([pngFile()], request);

    expect(uploads.queue()).toHaveLength(1);
    expect(uploads.queue()[0]?.status).toBe("processing");
    expect(uploads.queue()[0]?.assetId).toBe("a-1");
  });

  it("polls only the uploaded asset by id, never the whole library", async () => {
    const uploads = configure(
      createStubApi({
        assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
      }),
    );

    await uploads.upload([pngFile()], request);
    await vi.advanceTimersByTimeAsync(1500);

    expect(api.requests.some((r) => r.path === "/api/v1/assets/a-1")).toBe(
      true,
    );
    // Discovering one asset's status must not re-list the project.
    expect(
      api.requests.some(
        (r) => r.path === "/api/v1/assets" && r.method === "GET",
      ),
    ).toBe(false);
  });

  it("stops polling as soon as the asset is ready", async () => {
    const uploads = configure(
      createStubApi({
        assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
      }),
    );

    await uploads.upload([pngFile()], request);
    await vi.advanceTimersByTimeAsync(1500);
    const pollsAfterReady = api.requests.filter(
      (r) => r.path === "/api/v1/assets/a-1",
    ).length;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(uploads.queue()[0]?.status).toBe("ready");
    expect(
      api.requests.filter((r) => r.path === "/api/v1/assets/a-1"),
    ).toHaveLength(pollsAfterReady);
  });

  it("reports a failed processing job without claiming the upload itself failed", async () => {
    const uploads = configure(
      createStubApi({
        assets: [assetFixture("a-1", "Hero", { processingStatus: "failed" })],
      }),
    );

    await uploads.upload([pngFile()], request);
    await vi.advanceTimersByTimeAsync(1500);

    const item = uploads.queue()[0];
    expect(item?.status).toBe("failed");
    expect(item?.error?.detail).toContain("The upload succeeded");
  });

  it("records a failed upload with the API's own message", async () => {
    const stub = createStubApi();
    stub.override("POST", /\/v1\/assets\/upload$/, () =>
      apiErrorResponse(
        400,
        "invalid_image",
        "The file is not a supported image.",
      ),
    );
    const uploads = configure(stub);

    await uploads.upload([pngFile()], request);

    expect(uploads.queue()[0]?.status).toBe("failed");
    expect(uploads.queue()[0]?.error?.detail).toBe(
      "The file is not a supported image.",
    );
    expect(uploads.failedCount()).toBe(1);
  });

  it("keeps uploading the remaining files after one fails", async () => {
    const stub = createStubApi({ assets: [assetFixture("a-1", "Hero")] });
    let call = 0;
    stub.override("POST", /\/v1\/assets\/upload$/, () => {
      call += 1;
      if (call === 1)
        return apiErrorResponse(400, "invalid_image", "Rejected.");
      return new Response(
        JSON.stringify({
          asset: assetFixture("a-1", "Hero"),
          processingJobId: "job-1",
          processingDispatch: { mode: "queue", dispatched: true },
          duplicateCandidates: [],
          securityWarnings: [],
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    const uploads = configure(stub);

    await uploads.upload([pngFile("bad.png"), pngFile("good.png")], request);

    expect(uploads.queue()).toHaveLength(2);
    expect(uploads.queue()[0]?.status).toBe("failed");
    expect(uploads.queue()[1]?.status).toBe("processing");
  });

  it("bumps the settled counter exactly once per file, so listeners refresh once", async () => {
    const uploads = configure(
      createStubApi({
        assets: [assetFixture("a-1", "Hero", { processingStatus: "ready" })],
      }),
    );

    expect(uploads.settledAt()).toBe(0);
    await uploads.upload([pngFile()], request);
    await vi.advanceTimersByTimeAsync(1500);
    expect(uploads.settledAt()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(uploads.settledAt()).toBe(1);
  });

  it("surfaces a duplicate-checksum candidate without blocking the upload", async () => {
    const stub = createStubApi();
    stub.override(
      "POST",
      /\/v1\/assets\/upload$/,
      () =>
        new Response(
          JSON.stringify({
            asset: assetFixture("a-1", "Hero"),
            processingJobId: "job-1",
            processingDispatch: { mode: "queue", dispatched: true },
            duplicateCandidates: [{ assetId: "a-0", path: "existing/hero" }],
            securityWarnings: ["SVG content is not sanitized."],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    const uploads = configure(stub);

    await uploads.upload([pngFile()], request);

    const item = uploads.queue()[0];
    expect(item?.status).toBe("processing");
    expect(item?.duplicateOfPath).toBe("existing/hero");
    expect(item?.securityWarnings).toContain("SVG content is not sanitized.");
  });

  it("ignores an empty file list", async () => {
    const uploads = configure(createStubApi());
    await uploads.upload([], request);
    expect(uploads.queue()).toHaveLength(0);
    expect(api.requests).toHaveLength(0);
  });
});
