import { describe, expect, it } from "vitest";
import {
  DuplicateVariantError,
  ImageryxDomainError,
  InvalidImagePathError,
  ProviderUnavailableError,
  StorageObjectNotFoundError,
  UnsupportedOperationError,
} from "./domain-errors";

describe("domain errors", () => {
  it("every error exposes a stable code and is an instance of ImageryxDomainError", () => {
    const errors = [
      new InvalidImagePathError("bad path"),
      new DuplicateVariantError("dup"),
      new ProviderUnavailableError("unavailable"),
      new StorageObjectNotFoundError("missing"),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(ImageryxDomainError);
      expect(error).toBeInstanceOf(Error);
      expect(typeof error.code).toBe("string");
      expect(error.code.length).toBeGreaterThan(0);
    }
  });

  it("sets the error name to the concrete class name", () => {
    expect(new InvalidImagePathError("x").name).toBe("InvalidImagePathError");
  });

  it("UnsupportedOperationError carries the list of unsupported operations", () => {
    const error = new UnsupportedOperationError("nope", ["blur", "sharpen"]);
    expect(error.unsupportedOperations).toEqual(["blur", "sharpen"]);
    expect(error.code).toBe("unsupported_operation");
  });

  it("has distinct codes per error type", () => {
    const codes = [
      new InvalidImagePathError("x").code,
      new DuplicateVariantError("x").code,
      new ProviderUnavailableError("x").code,
      new StorageObjectNotFoundError("x").code,
    ];
    expect(new Set(codes).size).toBe(codes.length);
  });
});
