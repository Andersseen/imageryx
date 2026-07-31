import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiInfo } from "../core/health/api-info.types";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import { ProjectContextService } from "../core/projects/project-context.service";
import { IMAGERYX_CLIENT } from "../core/sdk/imageryx-client.token";
import { settle } from "../testing/render";
import {
  createStubApi,
  presetFixture,
  projectFixture,
  type StubApi,
} from "../testing/stub-client";
import ApiPage from "./api.page";

const TEST_ENV = {
  appEnv: "test",
  apiUrl: "http://api.test",
  deliveryUrl: "http://delivery.test",
  processingUrl: "http://processing.test",
};

function healthBody() {
  return {
    service: "api-worker",
    status: "healthy" as const,
    environment: "test",
    version: "0.0.0-test",
    timestamp: "2026-07-01T00:00:00.000Z",
  };
}

function apiInfoBody(overrides: Partial<ApiInfo> = {}): ApiInfo {
  return {
    ...healthBody(),
    product: "Imageryx",
    storageProvider: "local",
    transformationProvider: "mock",
    deliveryUrl: TEST_ENV.deliveryUrl,
    uploadPolicy: { maxUploadSizeMb: 25, assetRecoveryDays: 30 },
    processing: { mode: "queue", maxAttempts: 3 },
    apiKeyPrefix: "imgx_dev••••••••••••",
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  });
}

/**
 * `HealthService` (root-provided, used by both `/` and `/api`) calls the real global `fetch`
 * directly rather than going through `ImageryxClient` — a second, independent network boundary
 * from the SDK's own stubbed `fetch`, mocked here the same way for the same reason: exercise the
 * real service, fake only the network.
 */
function stubHealthFetch(info: ApiInfo = apiInfoBody()) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/proxy/v1/info")) return jsonResponse(info);
    if (url.includes("/health")) return jsonResponse(healthBody());
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

describe("ApiPage", () => {
  let api: StubApi;

  function configure(stub: StubApi) {
    api = stub;
    TestBed.configureTestingModule({
      imports: [ApiPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: DASHBOARD_ENV, useValue: TEST_ENV },
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
    const fixture = TestBed.createComponent(ApiPage);
    await settle(fixture, 5);
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? "";
  }

  const project = projectFixture("project-1", "Angular Lab", true);

  it("shows live service health for all three workers", async () => {
    stubHealthFetch();
    configure(createStubApi({ projects: [project] }));
    const fixture = await render();

    expect(text(fixture)).toContain("API Worker");
    expect(text(fixture)).toContain("Delivery Worker");
    expect(text(fixture)).toContain("Processing Worker");
    expect(text(fixture)).toContain("Healthy");
  });

  it("shows only the masked API key prefix, never the full key", async () => {
    stubHealthFetch(apiInfoBody({ apiKeyPrefix: "imgx_dev••••••••••••" }));
    configure(createStubApi({ projects: [project] }));
    const fixture = await render();

    const prefix = fixture.nativeElement.querySelector(
      '[data-testid="api-key-prefix"]',
    );
    expect(prefix?.textContent).toBe("imgx_dev••••••••••••");
    expect(text(fixture)).not.toContain("imgx_dev_local");
  });

  it("surfaces real upload policy and processing config from the info response", async () => {
    stubHealthFetch(
      apiInfoBody({
        uploadPolicy: { maxUploadSizeMb: 40, assetRecoveryDays: 14 },
      }),
    );
    configure(createStubApi({ projects: [project] }));
    const fixture = await render();

    expect(text(fixture)).toContain("40 MB max");
    expect(text(fixture)).toContain("14-day");
  });

  it("flags the mock transformation provider as a real limitation", async () => {
    stubHealthFetch(apiInfoBody({ transformationProvider: "mock" }));
    configure(createStubApi({ projects: [project] }));
    const fixture = await render();

    expect(text(fixture)).toContain("MockTransformationProvider");
  });

  it("prompts for a project before generating live code examples", async () => {
    stubHealthFetch();
    configure(createStubApi({ projects: [] }));
    const fixture = await render();

    expect(text(fixture)).toContain("Select a project");
  });

  it("generates real, copyable examples for the selected project and its first preset", async () => {
    stubHealthFetch();
    configure(
      createStubApi({
        projects: [project],
        presets: [
          presetFixture("preset-1", "Thumbnail", { projectId: "project-1" }),
        ],
      }),
    );
    const fixture = await render();

    const curl = fixture.nativeElement.querySelector(
      '[data-testid="example-curl"]',
    );
    expect(curl?.textContent).toContain("project-1");
    expect(curl?.textContent).toContain(TEST_ENV.apiUrl);

    const sdk = fixture.nativeElement.querySelector(
      '[data-testid="example-sdk"]',
    );
    expect(sdk?.textContent).toContain("angular-lab");
    expect(sdk?.textContent).toContain("thumbnail");
    expect(api.requests.some((r) => r.path === "/api/v1/presets")).toBe(true);
  });

  it("switches between example languages and offers copy feedback", async () => {
    stubHealthFetch();
    configure(createStubApi({ projects: [project] }));
    const fixture = await render();

    const angularTab = Array.from(
      fixture.nativeElement.querySelectorAll("volt-tabs-trigger"),
    ).find((el) => el.textContent?.trim() === "Angular") as
      | HTMLElement
      | undefined;
    expect(angularTab).toBeTruthy();
    angularTab!.click();
    await settle(fixture, 1);

    expect(
      fixture.nativeElement.querySelector('[data-testid="example-angular"]'),
    ).toBeTruthy();
  });
});
