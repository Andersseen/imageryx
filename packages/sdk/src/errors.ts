export interface ImageryxApiErrorInfo {
  status: number;
  code: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/** Thrown whenever the API responds with a non-2xx status carrying the shared `ApiError` envelope. */
export class ImageryxApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, info: ImageryxApiErrorInfo) {
    super(message);
    this.name = "ImageryxApiError";
    this.status = info.status;
    this.code = info.code;
    this.requestId = info.requestId;
    this.details = info.details;
  }
}

/** Thrown for client-side input problems caught before a request is even sent (e.g. a missing required field). */
export class ImageryxValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageryxValidationError";
  }
}

/** Thrown when `fetch` itself rejects (offline, DNS failure, CORS) — distinct from a well-formed error response. */
export class ImageryxNetworkError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ImageryxNetworkError";
    this.cause = cause;
  }
}
