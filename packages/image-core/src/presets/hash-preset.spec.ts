import { describe, expect, it } from "vitest";
import { hashPreset } from "./hash-preset";

describe("hashPreset", () => {
  it("produces a 64-character lowercase hex digest", async () => {
    const hash = await hashPreset({
      operations: [{ type: "resize", width: 320, fit: "cover" }],
      outputFormat: "auto",
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for identical input", async () => {
    const input = {
      operations: [
        { type: "resize", width: 320, height: 320, fit: "cover" } as const,
      ],
      outputFormat: "auto" as const,
      quality: 75,
    };
    const [a, b] = await Promise.all([hashPreset(input), hashPreset(input)]);
    expect(a).toBe(b);
  });

  it("produces the same hash for equivalent definitions (omitted vs. explicit default field)", async () => {
    const a = await hashPreset({
      operations: [{ type: "resize", width: 320, fit: "cover" }],
      outputFormat: "auto",
    });
    const b = await hashPreset({
      operations: [
        { type: "resize", width: 320, fit: "cover", withoutEnlargement: false },
      ],
      outputFormat: "auto",
      quality: null,
    });
    expect(a).toBe(b);
  });

  it("produces a different hash when operation order differs", async () => {
    const a = await hashPreset({
      operations: [
        { type: "rotate", degrees: 90 },
        { type: "grayscale", enabled: true },
      ],
      outputFormat: "auto",
    });
    const b = await hashPreset({
      operations: [
        { type: "grayscale", enabled: true },
        { type: "rotate", degrees: 90 },
      ],
      outputFormat: "auto",
    });
    expect(a).not.toBe(b);
  });

  it("produces a different hash when quality differs", async () => {
    const a = await hashPreset({
      operations: [],
      outputFormat: "auto",
      quality: 75,
    });
    const b = await hashPreset({
      operations: [],
      outputFormat: "auto",
      quality: 80,
    });
    expect(a).not.toBe(b);
  });

  it("produces a different hash when outputFormat differs", async () => {
    const a = await hashPreset({ operations: [], outputFormat: "auto" });
    const b = await hashPreset({ operations: [], outputFormat: "webp" });
    expect(a).not.toBe(b);
  });

  it("is not affected by provider-specific data (only takes domain fields)", async () => {
    const a = await hashPreset({
      operations: [{ type: "quality", value: 80 }],
      outputFormat: "jpeg",
    });
    const b = await hashPreset({
      operations: [{ type: "quality", value: 80 }],
      outputFormat: "jpeg",
      quality: undefined,
    });
    expect(a).toBe(b);
  });
});
