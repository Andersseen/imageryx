import { describe, expect, it } from "vitest";
import { parseDashboardEnv } from "./dashboard-env";

describe("parseDashboardEnv", () => {
  it("falls back to local dev defaults when nothing is set", () => {
    expect(parseDashboardEnv({})).toEqual({
      appEnv: "development",
      apiUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      processingUrl: "http://localhost:8789",
    });
  });

  it("uses provided values over defaults", () => {
    const env = parseDashboardEnv({
      VITE_APP_ENV: "staging",
      VITE_API_URL: "https://api.example.com",
      VITE_DELIVERY_URL: "https://cdn.example.com",
      VITE_PROCESSING_URL: "https://processing.example.com",
    });

    expect(env.appEnv).toBe("staging");
    expect(env.apiUrl).toBe("https://api.example.com");
  });

  it("uses production defaults for production builds", () => {
    expect(parseDashboardEnv({ PROD: true })).toEqual({
      appEnv: "production",
      apiUrl: "https://imageryx-api-worker.workers.dev",
      deliveryUrl: "https://imageryx-delivery-worker.workers.dev",
      processingUrl: "https://imageryx-processing-worker.workers.dev",
    });
  });

  it("strips trailing slashes so callers can safely append paths", () => {
    const env = parseDashboardEnv({ VITE_API_URL: "https://api.example.com/" });
    expect(env.apiUrl).toBe("https://api.example.com");
  });

  it("treats blank strings as unset", () => {
    const env = parseDashboardEnv({ VITE_API_URL: "   " });
    expect(env.apiUrl).toBe("http://localhost:8787");
  });
});
