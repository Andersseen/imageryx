import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGERYX_CLIENT } from "../sdk/imageryx-client.token";
import {
  apiErrorResponse,
  assetDetailsFixture,
  assetFixture,
  createStubApi,
  presetFixture,
  variantFixture,
  type StubApi,
} from "../../testing/stub-client";
import { AssetWorkspaceService } from "./asset-workspace.service";

describe("AssetWorkspaceService", () => {
  let api: StubApi;

  function configure(stub: StubApi): AssetWorkspaceService {
    api = stub;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: IMAGERYX_CLIENT, useValue: stub.client },
        AssetWorkspaceService,
      ],
    });
    return TestBed.inject(AssetWorkspaceService);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("loads the full asset workspace in one request", async () => {
    const base = assetFixture("a-1", "Hero");
    const service = configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );

    await service.load("a-1");

    expect(service.asset()?.id).toBe("a-1");
    expect(
      api.requests.filter((r) => r.path === "/api/v1/assets/a-1"),
    ).toHaveLength(1);
  });

  it("reports a not-found error for an asset that does not exist", async () => {
    const service = configure(createStubApi());
    await service.load("missing");
    expect(service.details.error()?.kind).toBe("not-found");
  });

  it("renames the asset and refreshes from the server", async () => {
    const base = assetFixture("a-1", "Hero");
    const service = configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    await service.load("a-1");

    const result = await service.updateSettings({ name: "New Name" });

    expect(result.ok).toBe(true);
    expect(service.asset()?.name).toBe("New Name");
    const patchRequest = api.requests.find((r) => r.method === "PATCH");
    expect(patchRequest?.body).toEqual({ name: "New Name" });
  });

  it("surfaces a conflict from the server rather than applying the change locally", async () => {
    const base = assetFixture("a-1", "Hero");
    const stub = createStubApi({
      assets: [base],
      assetDetails: { "a-1": assetDetailsFixture(base) },
    });
    stub.override("PATCH", /\/v1\/assets\/a-1$/, () =>
      apiErrorResponse(
        409,
        "duplicate_asset_path",
        'An asset already exists at path "hero-2".',
      ),
    );
    const service = configure(stub);
    await service.load("a-1");

    const result = await service.updateSettings({ slug: "hero-2" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain("hero-2");
    expect(service.asset()?.slug).toBe(base.slug);
  });

  it("soft-deletes without refetching a now-inaccessible asset", async () => {
    const base = assetFixture("a-1", "Hero");
    const service = configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    await service.load("a-1");
    api.requests.length = 0;

    const result = await service.softDelete();

    expect(result.ok).toBe(true);
    // No refresh after delete — the page navigates away instead of re-rendering a deleted asset.
    expect(api.requests.filter((r) => r.method === "GET")).toHaveLength(0);
  });

  it("restores and reflects the cleared deletedAt", async () => {
    const base = assetFixture("a-1", "Hero");
    const deleted = assetDetailsFixture(base, {
      deletedAt: "2026-07-01T00:00:00.000Z",
    });
    const service = configure(
      createStubApi({ assets: [base], assetDetails: { "a-1": deleted } }),
    );
    await service.load("a-1");

    const result = await service.restore();

    expect(result.ok).toBe(true);
    expect(service.asset()?.deletedAt).toBeNull();
  });

  it("creates a signed download URL only on request, not automatically", async () => {
    const base = assetFixture("a-1", "Hero");
    const service = configure(
      createStubApi({
        assets: [base],
        assetDetails: { "a-1": assetDetailsFixture(base) },
      }),
    );
    await service.load("a-1");
    expect(api.requests.some((r) => r.path.includes("download-url"))).toBe(
      false,
    );

    const result = await service.createDownloadUrl("original", 900);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toContain("signed-token-original");
  });

  describe("generateVariant", () => {
    it("moves an already-ready preset straight to ready with no polling", async () => {
      const base = assetFixture("a-1", "Hero");
      const preset = presetFixture("preset-1", "Thumbnail");
      const readyVariant = variantFixture("v1", "a-1", "preset-1", {
        status: "ready",
      });
      const details = assetDetailsFixture(base, {
        presets: [preset],
        variants: [readyVariant],
      });
      const service = configure(
        createStubApi({ assets: [base], assetDetails: { "a-1": details } }),
      );
      await service.load("a-1");

      await service.generateVariant("preset-1", true);

      expect(service.requestsByPreset().get("preset-1")?.status).toBe("ready");
      expect(
        api.requests.some((r) => r.path.includes("/processing-jobs/")),
      ).toBe(false);
    });

    it("polls only the resulting job, never the whole library", async () => {
      const base = assetFixture("a-1", "Hero");
      const preset = presetFixture("preset-1", "Thumbnail");
      const details = assetDetailsFixture(base, {
        presets: [preset],
        variants: [],
      });
      const service = configure(
        createStubApi({ assets: [base], assetDetails: { "a-1": details } }),
      );
      await service.load("a-1");

      const generation = service.generateVariant("preset-1", true);
      await vi.advanceTimersByTimeAsync(0);
      expect(service.requestsByPreset().get("preset-1")?.status).toBe(
        "polling",
      );

      const jobId = service.requestsByPreset().get("preset-1")?.jobId;
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

      await vi.advanceTimersByTimeAsync(1200);
      await generation;

      expect(service.requestsByPreset().get("preset-1")?.status).toBe("ready");
      expect(service.asset()?.variants[0]?.status).toBe("ready");
      expect(api.requests.some((r) => r.path === "/api/v1/assets")).toBe(false);
    });

    it("reports a failed job with its real error message", async () => {
      const base = assetFixture("a-1", "Hero");
      const preset = presetFixture("preset-1", "Thumbnail");
      const details = assetDetailsFixture(base, {
        presets: [preset],
        variants: [],
      });
      const service = configure(
        createStubApi({ assets: [base], assetDetails: { "a-1": details } }),
      );
      await service.load("a-1");

      const generation = service.generateVariant("preset-1", true);
      await vi.advanceTimersByTimeAsync(0);
      const jobId = service.requestsByPreset().get("preset-1")?.jobId;
      api.state.processingJobs = api.state.processingJobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: "failed" as const,
              errorMessage: "Transformation failed.",
            }
          : j,
      );

      await vi.advanceTimersByTimeAsync(1200);
      await generation;

      const request = service.requestsByPreset().get("preset-1");
      expect(request?.status).toBe("failed");
      expect(request?.error?.detail).toBe("Transformation failed.");
    });

    it("marks a preset as active while its request is in flight", async () => {
      const base = assetFixture("a-1", "Hero");
      const preset = presetFixture("preset-1", "Thumbnail");
      const details = assetDetailsFixture(base, {
        presets: [preset],
        variants: [],
      });
      const service = configure(
        createStubApi({ assets: [base], assetDetails: { "a-1": details } }),
      );
      await service.load("a-1");

      expect(service.isRequestActive("preset-1")).toBe(false);
      const generation = service.generateVariant("preset-1", true);
      await vi.advanceTimersByTimeAsync(0);
      expect(service.isRequestActive("preset-1")).toBe(true);

      const jobId = service.requestsByPreset().get("preset-1")?.jobId;
      api.state.processingJobs = api.state.processingJobs.map((j) =>
        j.id === jobId ? { ...j, status: "completed" as const } : j,
      );
      await vi.advanceTimersByTimeAsync(1200);
      await generation;
      expect(service.isRequestActive("preset-1")).toBe(false);
    });
  });
});
