import { describe, expect, it } from "vitest";
import { withSvgSecurityHeaders } from "../src/lib/svg-headers";

describe("withSvgSecurityHeaders", () => {
  it("adds a script-blocking CSP for image/svg+xml", () => {
    const result = withSvgSecurityHeaders({ "Content-Type": "image/svg+xml" }, "image/svg+xml");
    expect(result["Content-Security-Policy"]).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  });

  it("leaves non-SVG headers untouched", () => {
    const input = { "Content-Type": "image/png" };
    expect(withSvgSecurityHeaders(input, "image/png")).toEqual(input);
  });

  it("leaves headers untouched when the mime type is missing", () => {
    const input = { "Content-Type": "application/octet-stream" };
    expect(withSvgSecurityHeaders(input, null)).toEqual(input);
    expect(withSvgSecurityHeaders(input, undefined)).toEqual(input);
  });

  it("does not mutate the input headers object", () => {
    const input = { "Content-Type": "image/svg+xml" };
    withSvgSecurityHeaders(input, "image/svg+xml");
    expect(input).not.toHaveProperty("Content-Security-Policy");
  });
});
