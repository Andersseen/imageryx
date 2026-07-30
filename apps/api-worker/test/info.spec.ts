import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ServiceInfoResponse } from "../src/routes/info";

describe("GET /v1/info", () => {
  it("reports the product, service, and placeholder providers", async () => {
    const response = await SELF.fetch("https://example.com/v1/info");

    expect(response.status).toBe(200);
    const body = (await response.json()) as ServiceInfoResponse;
    expect(body.product).toBe("Imageryx");
    expect(body.service).toBe("api-worker");
    expect(body.storageProvider).toBe("local");
    expect(body.transformationProvider).toBe("mock");
  });
});

describe("unknown route", () => {
  it("returns a JSON 404 with a request id", async () => {
    const response = await SELF.fetch("https://example.com/does-not-exist");

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ error: "Not Found" });
  });
});
