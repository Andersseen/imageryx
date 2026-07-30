import { describe, expect, it } from "vitest";
import { buildDeliveryPath, buildDeliveryUrl } from "./delivery-path";

describe("buildDeliveryPath", () => {
  it("builds an original path with no preset", () => {
    expect(buildDeliveryPath("andersseen-portfolio", "profile/andrii")).toBe(
      "/andersseen-portfolio/assets/profile/andrii",
    );
  });

  it("builds a preset path using the /p/ marker", () => {
    expect(buildDeliveryPath("angular-lab", "courses/signals/hero", "hero")).toBe(
      "/angular-lab/assets/courses/signals/hero/p/hero",
    );
  });
});

describe("buildDeliveryUrl", () => {
  it("strips trailing slashes from the base URL", () => {
    expect(buildDeliveryUrl("http://localhost:8788/", "proj", "a/b")).toBe(
      "http://localhost:8788/proj/assets/a/b",
    );
  });

  it("includes the preset segment when provided", () => {
    expect(buildDeliveryUrl("http://localhost:8788", "proj", "a/b", "thumb")).toBe(
      "http://localhost:8788/proj/assets/a/b/p/thumb",
    );
  });
});
