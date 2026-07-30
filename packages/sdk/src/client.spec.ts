import { describe, expect, it, vi } from "vitest";
import { createImageryxClient } from "./client";
import { ImageryxApiError, ImageryxNetworkError, ImageryxValidationError } from "./errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createImageryxClient", () => {
  it("sends the Authorization header derived from apiKey on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 }));
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      apiKey: "imgx_dev_local",
      fetch: fetchMock,
    });

    await client.projects.list();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer imgx_dev_local");
  });

  it("omits the Authorization header when no apiKey is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "healthy" }));
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      fetch: fetchMock,
    });

    await client.stats.get();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sends multipart FormData for asset uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ asset: {}, processingJobId: "job-1" }, 201));
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      fetch: fetchMock,
    });

    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" });
    await client.assets.upload({ projectId: "project-1", file, tags: ["a", "b"] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8787/v1/assets/upload");
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("projectId")).toBe("project-1");
    expect(body.getAll("tags")).toEqual(["a", "b"]);
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("rejects an upload with no projectId before sending a request", async () => {
    const fetchMock = vi.fn();
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      fetch: fetchMock,
    });

    const file = new File([new Uint8Array([1])], "test.png", { type: "image/png" });
    await expect(
      client.assets.upload({ projectId: "", file }),
    ).rejects.toBeInstanceOf(ImageryxValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a non-2xx JSON error response to ImageryxApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { code: "project_not_found", message: "not found", requestId: "req_1" } },
        404,
      ),
    );
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      fetch: fetchMock,
    });

    await expect(client.projects.get("missing")).rejects.toMatchObject({
      status: 404,
      code: "project_not_found",
      requestId: "req_1",
    });
    await expect(client.projects.get("missing")).rejects.toBeInstanceOf(ImageryxApiError);
  });

  it("maps a fetch rejection to ImageryxNetworkError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      fetch: fetchMock,
    });

    await expect(client.stats.get()).rejects.toBeInstanceOf(ImageryxNetworkError);
  });

  it("URL-encodes path segments containing special characters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = createImageryxClient({
      baseUrl: "http://localhost:8787",
      deliveryUrl: "http://localhost:8788",
      fetch: fetchMock,
    });

    await client.presets.get("preset with spaces/slash");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:8787/v1/presets/preset%20with%20spaces%2Fslash");
  });
});
