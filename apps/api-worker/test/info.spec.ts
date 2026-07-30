import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ServiceInfoResponse } from "../src/routes/info";
import { authHeaders } from "./helpers";

describe("GET /v1/info", () => {
  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/v1/info");
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("reports the product, service, and configured providers when authenticated", async () => {
    const response = await SELF.fetch("https://example.com/v1/info", {
      headers: authHeaders(),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ServiceInfoResponse;
    expect(body.product).toBe("Imageryx");
    expect(body.service).toBe("api-worker");
    expect(body.storageProvider).toBe("r2");
    expect(body.transformationProvider).toBe("mock");
  });
});

describe("unknown route", () => {
  it("returns a normalized JSON 404 with a request id", async () => {
    const response = await SELF.fetch("https://example.com/does-not-exist");

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.requestId).toBe("string");
  });
});
