import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, notFoundHandler } from "./error-handler";

function fakeContext() {
  return {
    get: (key: string) => (key === "requestId" ? "req-test" : undefined),
    json: (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  };
}

describe("processing-worker error handlers", () => {
  it("returns the HTTPException message and status", async () => {
    const error = new HTTPException(418, { message: "teapot" });
    const response = await errorHandler(error, fakeContext() as never);

    expect(response.status).toBe(418);
    await expect(response.json()).resolves.toEqual({
      error: "teapot",
      requestId: "req-test",
    });
  });

  it("hides unexpected error details but logs them", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await errorHandler(
      new Error("database exploded"),
      fakeContext() as never,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
      requestId: "req-test",
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("database exploded"),
    );
    spy.mockRestore();
  });

  it("formats not found responses with the request id", async () => {
    const response = await notFoundHandler(fakeContext() as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Not Found",
      requestId: "req-test",
    });
  });
});
