import {
  ImageryxApiError,
  ImageryxNetworkError,
  ImageryxValidationError,
} from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import {
  conflictCode,
  describeApiError,
  isConflict,
  isNotFound,
} from "./api-error";

function apiError(
  status: number,
  code = "some_code",
  message = "Boom.",
): ImageryxApiError {
  return new ImageryxApiError(message, { status, code, requestId: "req-1" });
}

describe("describeApiError", () => {
  it("maps 404 to a non-retryable not-found", () => {
    const info = describeApiError(
      apiError(404, "not_found", "Asset not found."),
    );
    expect(info.kind).toBe("not-found");
    expect(info.title).toBe("Not found");
    expect(info.detail).toBe("Asset not found.");
    expect(info.retryable).toBe(false);
  });

  it("maps 409 to a non-retryable conflict and keeps the machine code", () => {
    const info = describeApiError(apiError(409, "duplicate_asset_path"));
    expect(info.kind).toBe("conflict");
    expect(info.code).toBe("duplicate_asset_path");
    expect(info.retryable).toBe(false);
  });

  it("maps 400 and 422 to validation", () => {
    expect(describeApiError(apiError(400)).kind).toBe("validation");
    expect(describeApiError(apiError(422)).kind).toBe("validation");
  });

  it("maps 401 and 403 to unauthorized", () => {
    expect(describeApiError(apiError(401)).kind).toBe("unauthorized");
    expect(describeApiError(apiError(403)).kind).toBe("unauthorized");
  });

  it("maps 5xx to a retryable server error", () => {
    const info = describeApiError(apiError(503));
    expect(info.kind).toBe("server");
    expect(info.retryable).toBe(true);
  });

  it("carries the request id through for log correlation", () => {
    expect(describeApiError(apiError(500)).requestId).toBe("req-1");
  });

  it("describes a network error as retryable without inventing a code", () => {
    const info = describeApiError(new ImageryxNetworkError("fetch failed"));
    expect(info.kind).toBe("network");
    expect(info.retryable).toBe(true);
    expect(info.code).toBeNull();
  });

  it("surfaces a client-side validation message directly", () => {
    const info = describeApiError(
      new ImageryxValidationError("projectId is required."),
    );
    expect(info.kind).toBe("validation");
    expect(info.detail).toBe("projectId is required.");
  });

  it("never renders the message of an unrecognized error", () => {
    const info = describeApiError(
      new Error("TypeError: undefined is not a function at foo.ts:12"),
    );
    expect(info.kind).toBe("unknown");
    expect(info.detail).not.toContain("foo.ts");
    expect(info.detail).toContain("unexpected error");
  });

  it("handles non-Error throwables", () => {
    expect(describeApiError("nope").kind).toBe("unknown");
    expect(describeApiError(undefined).kind).toBe("unknown");
  });
});

describe("error predicates", () => {
  it("recognizes not-found for both 404 and 410", () => {
    expect(isNotFound(apiError(404))).toBe(true);
    expect(isNotFound(apiError(410))).toBe(true);
    expect(isNotFound(apiError(409))).toBe(false);
    expect(isNotFound(new Error("x"))).toBe(false);
  });

  it("extracts a conflict code only from a real conflict", () => {
    expect(isConflict(apiError(409))).toBe(true);
    expect(conflictCode(apiError(409, "restore_path_conflict"))).toBe(
      "restore_path_conflict",
    );
    expect(conflictCode(apiError(404, "not_found"))).toBeNull();
  });
});
