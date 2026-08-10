// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  it("keeps same-site absolute paths", () => {
    expect(sanitizeReturnTo("/library")).toBe("/library");
    expect(sanitizeReturnTo("/projects/abc?tab=variants")).toBe(
      "/projects/abc?tab=variants",
    );
    expect(sanitizeReturnTo("/settings#tokens")).toBe("/settings#tokens");
  });

  it.each([
    ["https://evil.example/steal", "an absolute URL"],
    ["http://evil.example", "an absolute http URL"],
    ["//evil.example/steal", "a protocol-relative URL"],
    ["///evil.example", "a triple-slash URL"],
    ["/\\evil.example", "a backslash protocol-relative URL"],
    ["javascript:alert(1)", "a javascript: URL"],
    ["settings", "a bare relative path"],
    ["", "an empty string"],
  ])("rejects %s (%s)", (input) => {
    expect(sanitizeReturnTo(input)).toBe("/");
  });

  it("rejects values carrying CR or LF, which would inject a response header", () => {
    expect(sanitizeReturnTo("/library\r\nSet-Cookie: a=b")).toBe("/");
    expect(sanitizeReturnTo("/library\nLocation: https://evil.example")).toBe(
      "/",
    );
  });

  it("falls back for non-string input", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo(["/a", "/b"])).toBe("/");
    expect(sanitizeReturnTo({ toString: () => "/evil" })).toBe("/");
  });
});
