import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_ENV } from "../core/env/dashboard-env.token";
import type { ApiInfo } from "../core/health/api-info.types";
import { settle } from "../testing/render";
import SettingsPage from "./settings.page";

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubHealthFetch(info: ApiInfo = apiInfoBody()) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/proxy/v1/info")) return jsonResponse(info);
    if (url.includes("/health")) return jsonResponse(healthBody());
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

describe("SettingsPage", () => {
  function configure() {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: DASHBOARD_ENV, useValue: TEST_ENV },
      ],
    });
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function render() {
    const fixture = TestBed.createComponent(SettingsPage);
    await settle(fixture, 5);
    return fixture;
  }

  function text(fixture: { nativeElement: HTMLElement }): string {
    return fixture.nativeElement.textContent ?? "";
  }

  it("shows real, live configuration once the API Worker responds", async () => {
    stubHealthFetch(
      apiInfoBody({ storageProvider: "local", transformationProvider: "mock" }),
    );
    configure();
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid="settings-storage"]')
        ?.textContent,
    ).toContain("local");
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="settings-transformations"]',
      )?.textContent,
    ).toContain("mock");
  });

  it("shows a real error, not a blank page, when the API Worker is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("connection refused"),
    );
    configure();
    const fixture = await render();

    expect(text(fixture)).toContain("Could not load configuration");
  });

  it("presents every value as read-only — no save button anywhere on the page", async () => {
    stubHealthFetch();
    configure();
    const fixture = await render();

    expect(
      fixture.nativeElement.querySelector('[data-testid$="-save"]'),
    ).toBeNull();
    expect(text(fixture)).toContain("read-only");
  });

  it("surfaces the real upload policy and processing configuration", async () => {
    stubHealthFetch(
      apiInfoBody({
        uploadPolicy: { maxUploadSizeMb: 50, assetRecoveryDays: 7 },
        processing: { mode: "inline-local", maxAttempts: 5 },
      }),
    );
    configure();
    const fixture = await render();

    const uploadPolicy = fixture.nativeElement.querySelector(
      '[data-testid="settings-upload-policy"]',
    );
    expect(uploadPolicy?.textContent).toContain("50 MB");
    expect(uploadPolicy?.textContent).toContain("7 days");

    const processing = fixture.nativeElement.querySelector(
      '[data-testid="settings-processing"]',
    );
    expect(processing?.textContent).toContain("inline-local");
    expect(processing?.textContent).toContain("5");
  });

  it("shows the dashboard, API, delivery and processing domains", async () => {
    stubHealthFetch();
    configure();
    const fixture = await render();

    const domains = fixture.nativeElement.querySelector(
      '[data-testid="settings-domains"]',
    );
    expect(domains?.textContent).toContain(TEST_ENV.apiUrl);
    expect(domains?.textContent).toContain(TEST_ENV.processingUrl);
    expect(domains?.textContent).toContain(TEST_ENV.deliveryUrl);
  });

  it("links to the API reference page instead of duplicating it", async () => {
    stubHealthFetch();
    configure();
    const fixture = await render();

    const link = fixture.nativeElement.querySelector('a[href="/api"]');
    expect(link).toBeTruthy();
  });
});
