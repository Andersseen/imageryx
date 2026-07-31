import {
  ImageryxApiError,
  ImageryxNetworkError,
  ImageryxValidationError,
} from "@imageryx/sdk";

/**
 * How an error should be *presented*, independent of which SDK class produced it. Every page
 * renders from this shape rather than branching on error classes itself, so "not found" looks
 * and behaves the same everywhere and a raw provider/SQL string can never reach the DOM.
 */
export type ApiErrorKind =
  | "not-found"
  | "conflict"
  | "validation"
  | "unauthorized"
  | "network"
  | "server"
  | "unknown";

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  /** Short, human-readable heading. Safe to render. */
  title: string;
  /** One sentence of detail. Safe to render — never a stack trace or raw provider message. */
  detail: string;
  /** The API's stable machine code, when there was one. Shown only as small print. */
  code: string | null;
  /** Correlates a client-visible failure with a server log line. */
  requestId: string | null;
  /** Whether re-running the same request could plausibly succeed. Drives whether a Retry button shows. */
  retryable: boolean;
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: "validation",
  401: "unauthorized",
  403: "unauthorized",
  404: "not-found",
  409: "conflict",
  410: "not-found",
  422: "validation",
};

const TITLE_BY_KIND: Record<ApiErrorKind, string> = {
  "not-found": "Not found",
  conflict: "Conflicting change",
  validation: "Invalid request",
  unauthorized: "Not authorized",
  network: "Cannot reach the API",
  server: "The API returned an error",
  unknown: "Something went wrong",
};

function kindForStatus(status: number): ApiErrorKind {
  return KIND_BY_STATUS[status] ?? (status >= 500 ? "server" : "unknown");
}

/**
 * Normalizes anything thrown by an SDK call into a renderable shape.
 *
 * `ImageryxApiError.message` already comes from api-worker's central error handler, which is the
 * one place that guarantees no stack trace, SQL fragment, absolute path, or provider error ever
 * reaches a response body (see context.md, "Central auth, error handling, request IDs"). Anything
 * *not* from that envelope is deliberately replaced with a generic sentence rather than surfaced:
 * an unexpected `Error` here is a bug in our own client code, and its message is for the console.
 */
export function describeApiError(error: unknown): ApiErrorInfo {
  if (error instanceof ImageryxApiError) {
    const kind = kindForStatus(error.status);
    return {
      kind,
      title: TITLE_BY_KIND[kind],
      detail: error.message,
      code: error.code,
      requestId: error.requestId ?? null,
      retryable: kind === "server" || kind === "unknown",
    };
  }

  if (error instanceof ImageryxNetworkError) {
    return {
      kind: "network",
      title: TITLE_BY_KIND.network,
      detail:
        "The request never reached the API. Check that the API worker is running and reachable.",
      code: null,
      requestId: null,
      retryable: true,
    };
  }

  if (error instanceof ImageryxValidationError) {
    return {
      kind: "validation",
      title: TITLE_BY_KIND.validation,
      detail: error.message,
      code: null,
      requestId: null,
      retryable: false,
    };
  }

  return {
    kind: "unknown",
    title: TITLE_BY_KIND.unknown,
    detail:
      "An unexpected error occurred. Check the browser console for details.",
    code: null,
    requestId: null,
    retryable: true,
  };
}

export function isNotFound(error: unknown): boolean {
  return (
    error instanceof ImageryxApiError &&
    (error.status === 404 || error.status === 410)
  );
}

export function isConflict(error: unknown): boolean {
  return error instanceof ImageryxApiError && error.status === 409;
}

/** The API's machine code for a conflict (e.g. `duplicate_asset_path`), for branching on a specific recoverable case. */
export function conflictCode(error: unknown): string | null {
  return isConflict(error) ? (error as ImageryxApiError).code : null;
}
