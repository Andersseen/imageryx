import { describe, expect, it } from "vitest";
import { computeSha256Checksum } from "./checksum";

describe("computeSha256Checksum", () => {
  it("matches the known SHA-256 digest of an empty input", async () => {
    const checksum = await computeSha256Checksum(new Uint8Array());
    expect(checksum).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('matches the known SHA-256 digest of "abc"', async () => {
    const checksum = await computeSha256Checksum(
      new TextEncoder().encode("abc"),
    );
    expect(checksum).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic for the same input", async () => {
    const bytes = new TextEncoder().encode("imageryx");
    const [first, second] = await Promise.all([
      computeSha256Checksum(bytes),
      computeSha256Checksum(bytes),
    ]);
    expect(first).toBe(second);
  });

  it("produces a lowercase 64-character hex string", async () => {
    const checksum = await computeSha256Checksum(
      new TextEncoder().encode("imageryx"),
    );
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different checksums for different input", async () => {
    const a = await computeSha256Checksum(new TextEncoder().encode("a"));
    const b = await computeSha256Checksum(new TextEncoder().encode("b"));
    expect(a).not.toBe(b);
  });
});
