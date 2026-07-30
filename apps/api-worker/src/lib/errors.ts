/**
 * API-facing HTTP errors. Every route throws one of these (never a raw
 * `Error`) so the central error handler (`middleware/error-handler.ts`) can
 * translate it into the shared `ApiError` envelope without guessing a
 * status code from a message string.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends ApiHttpError {
  constructor(message = "Authentication is required.") {
    super(401, "unauthorized", message);
  }
}

export class NotFoundError extends ApiHttpError {
  constructor(resource: string, message?: string) {
    super(
      404,
      `${resource}_not_found`,
      message ?? `The requested ${resource.replace(/_/g, " ")} was not found.`,
    );
  }
}

export class ConflictError extends ApiHttpError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(409, code, message, details);
  }
}

export class ValidationHttpError extends ApiHttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, "validation_error", message, details);
  }
}

export class PayloadTooLargeError extends ApiHttpError {
  constructor(message: string) {
    super(413, "payload_too_large", message);
  }
}

export class UnsupportedMediaTypeError extends ApiHttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(415, "unsupported_media_type", message, details);
  }
}

export class UnprocessableEntityError extends ApiHttpError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(422, code, message, details);
  }
}
