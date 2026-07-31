import { afterEach, describe, expect, it } from "vitest";
import { ImageryxValidationError } from "./errors";
import { isAbsoluteUrl, resolveRequestUrl } from "./request-url";

/**
 * `globalThis.location` does not exist under Vitest's default `node` environment, which is
 * exactly the "no browser origin" case these tests need to cover — so it is defined and removed
 * explicitly rather than assumed either way.
 */
function withLocationOrigin(origin: string, run: () => void): void {
  Object.defineProperty(globalThis, "location", {
    value: { origin },
    configurable: true,
    writable: true,
  });
  try {
    run();
  } finally {
    Reflect.deleteProperty(globalThis as object, "location");
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, "location");
});

describe("isAbsoluteUrl", () => {
  it("recognizes http and https", () => {
    expect(isAbsoluteUrl("http://localhost:8787")).toBe(true);
    expect(isAbsoluteUrl("https://api.example.com")).toBe(true);
  });

  it("rejects relative paths", () => {
    expect(isAbsoluteUrl("/api")).toBe(false);
    expect(isAbsoluteUrl("api")).toBe(false);
    expect(isAbsoluteUrl("")).toBe(false);
  });
});

describe("resolveRequestUrl with an absolute base", () => {
  it("joins the path onto the base", () => {
    expect(
      resolveRequestUrl("http://localhost:8787", "/v1/projects").toString(),
    ).toBe("http://localhost:8787/v1/projects");
  });

  it("tolerates trailing slashes on the base and leading slashes on the path", () => {
    expect(
      resolveRequestUrl(
        "http://localhost:8787///",
        "///v1/projects",
      ).toString(),
    ).toBe("http://localhost:8787/v1/projects");
  });

  it("preserves a base path prefix instead of discarding it", () => {
    expect(
      resolveRequestUrl(
        "https://example.com/imageryx",
        "/v1/assets",
      ).toString(),
    ).toBe("https://example.com/imageryx/v1/assets");
  });

  it("does not need a browser origin", () => {
    expect(Reflect.get(globalThis, "location")).toBeUndefined();
    expect(() =>
      resolveRequestUrl("http://localhost:8787", "/v1/info"),
    ).not.toThrow();
  });
});

describe("resolveRequestUrl with a relative base", () => {
  it("resolves against the document origin — the dashboard's same-origin proxy case", () => {
    withLocationOrigin("http://localhost:5173", () => {
      expect(resolveRequestUrl("/api", "/v1/projects").toString()).toBe(
        "http://localhost:5173/api/v1/projects",
      );
    });
  });

  it("keeps nested base segments", () => {
    withLocationOrigin("https://dashboard.example.com", () => {
      expect(
        resolveRequestUrl("/proxy/api", "/v1/assets/upload").toString(),
      ).toBe("https://dashboard.example.com/proxy/api/v1/assets/upload");
    });
  });

  it("throws a named, actionable error when there is no origin to resolve against", () => {
    expect(() => resolveRequestUrl("/api", "/v1/projects")).toThrow(
      ImageryxValidationError,
    );
    expect(() => resolveRequestUrl("/api", "/v1/projects")).toThrow(
      /only supported in a browser/,
    );
  });
});
