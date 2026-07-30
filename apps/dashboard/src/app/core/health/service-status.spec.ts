import { describe, expect, it } from "vitest";
import { describeServiceHealth } from "./service-status";

describe("describeServiceHealth", () => {
  it("describes the loading state", () => {
    expect(describeServiceHealth({ status: "loading" })).toEqual({
      label: "Checking…",
      tone: "neutral",
    });
  });

  it("describes a fetch/network error as unreachable", () => {
    expect(
      describeServiceHealth({ status: "error", message: "Failed to fetch" }),
    ).toEqual({
      label: "Unreachable",
      tone: "negative",
    });
  });

  it("describes a healthy response as positive", () => {
    expect(
      describeServiceHealth({
        status: "success",
        data: {
          service: "api-worker",
          status: "healthy",
          environment: "development",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
        },
      }),
    ).toEqual({ label: "Healthy", tone: "positive" });
  });

  it("describes a degraded response as a warning", () => {
    expect(
      describeServiceHealth({
        status: "success",
        data: {
          service: "delivery-worker",
          status: "degraded",
          environment: "development",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
        },
      }),
    ).toEqual({ label: "Degraded", tone: "warning" });
  });

  it("describes a down response as negative", () => {
    expect(
      describeServiceHealth({
        status: "success",
        data: {
          service: "processing-worker",
          status: "down",
          environment: "development",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
        },
      }),
    ).toEqual({ label: "Down", tone: "negative" });
  });
});
