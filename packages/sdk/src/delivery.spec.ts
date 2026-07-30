import { describe, expect, it } from "vitest";
import { DeliveryResource } from "./delivery";

describe("DeliveryResource", () => {
  const delivery = new DeliveryResource({ deliveryUrl: "http://localhost:8788" });

  it("builds an original delivery URL", () => {
    expect(delivery.originalUrl("angular-lab", "courses/signals/hero")).toBe(
      "http://localhost:8788/angular-lab/assets/courses/signals/hero",
    );
  });

  it("builds a preset delivery URL", () => {
    expect(delivery.presetUrl("angular-lab", "courses/signals/hero", "hero")).toBe(
      "http://localhost:8788/angular-lab/assets/courses/signals/hero/p/hero",
    );
  });

  it("generates a responsive srcset with width descriptors", () => {
    const srcset = delivery.srcset("angular-lab", "courses/signals/hero", [
      { preset: "content-sm", width: 480 },
      { preset: "hero", width: 1920 },
    ]);
    expect(srcset).toBe(
      "http://localhost:8788/angular-lab/assets/courses/signals/hero/p/content-sm 480w, " +
        "http://localhost:8788/angular-lab/assets/courses/signals/hero/p/hero 1920w",
    );
  });
});
