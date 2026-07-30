import { describe, expect, it } from "vitest";
import { utf8ToBase64 } from "./base64";

describe("utf8ToBase64", () => {
  it("encodes plain ASCII the same way btoa would", () => {
    expect(utf8ToBase64("hello")).toBe(btoa("hello"));
  });

  it("encodes multi-byte UTF-8 characters (an em dash) without throwing", () => {
    const encoded = utf8ToBase64("Preview source — Hero");
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
    expect(decoded).toBe("Preview source — Hero");
  });
});
