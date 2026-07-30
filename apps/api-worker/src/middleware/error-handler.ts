import type { ApiErrorResponse } from "@imageryx/contracts";
import { ImageryxDomainError } from "@imageryx/image-core";
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { ApiHttpError } from "../lib/errors";
import type { RequestIdVariables } from "./request-id";

/** Every non-`ApiHttpError` domain error maps to a fixed status + code — never a raw error message forwarded as-is. */
const DOMAIN_ERROR_STATUS: Record<string, ContentfulStatusCode> = {
  invalid_image_path: 400,
  unsupported_image_format: 400,
  invalid_preset: 400,
  unsupported_operation: 422,
  duplicate_variant: 409,
  provider_unavailable: 503,
  storage_object_not_found: 404,
  invalid_state_transition: 409,
};

function apiErrorBody(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

/**
 * Central error handler. Translates every error type this Worker can
 * throw into the shared `ApiError` envelope. Never forwards a raw
 * message, stack trace, SQL fragment, absolute path, or provider error —
 * `ApiHttpError` and the mapped domain errors carry an already-safe
 * message; anything else (a genuinely unexpected error) becomes a fixed,
 * generic 500 message, with the real error only ever logged server-side.
 */
export const errorHandler: ErrorHandler<{
  Bindings: Env;
  Variables: RequestIdVariables;
}> = (err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof ApiHttpError) {
    if (err.status >= 500) {
      console.error(
        JSON.stringify({
          requestId,
          code: err.code,
          error: err.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
    return c.json(
      apiErrorBody(err.code, err.message, requestId, err.details),
      err.status as ContentfulStatusCode,
    );
  }

  if (err instanceof ZodError) {
    const fieldIssues = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return c.json(
      apiErrorBody(
        "validation_error",
        "The request did not pass validation.",
        requestId,
        { issues: fieldIssues },
      ),
      400,
    );
  }

  if (err instanceof ImageryxDomainError) {
    const status = DOMAIN_ERROR_STATUS[err.code] ?? 400;
    const details =
      "unsupportedOperations" in err &&
      Array.isArray((err as { unsupportedOperations?: unknown }).unsupportedOperations)
        ? {
            unsupportedOperations: (err as { unsupportedOperations: string[] })
              .unsupportedOperations,
          }
        : undefined;
    return c.json(apiErrorBody(err.code, err.message, requestId, details), status);
  }

  if (err instanceof HTTPException) {
    return c.json(
      apiErrorBody("http_error", err.message || "Request could not be processed.", requestId),
      err.status,
    );
  }

  console.error(
    JSON.stringify({
      requestId,
      error: err.message,
      timestamp: new Date().toISOString(),
    }),
  );
  return c.json(apiErrorBody("internal_error", "An unexpected error occurred.", requestId), 500);
};

export const notFoundHandler: NotFoundHandler<{
  Bindings: Env;
  Variables: RequestIdVariables;
}> = (c) => {
  const requestId = c.get("requestId");
  return c.json(
    { error: { code: "not_found", message: "Not Found", requestId } } satisfies ApiErrorResponse,
    404,
  );
};
