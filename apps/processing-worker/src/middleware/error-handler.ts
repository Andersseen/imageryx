import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RequestIdVariables } from "./request-id";

/**
 * Central error handler. Never leaks stack traces or internal error
 * messages to the client; always logs the underlying error server-side
 * with the correlating request ID.
 */
export const errorHandler: ErrorHandler<{
  Bindings: Env;
  Variables: RequestIdVariables;
}> = (err, c) => {
  const requestId = c.get("requestId");
  console.error(
    JSON.stringify({
      requestId,
      error: err.message,
      timestamp: new Date().toISOString(),
    }),
  );

  if (err instanceof HTTPException) {
    return c.json({ error: err.message, requestId }, err.status);
  }

  return c.json({ error: "Internal Server Error", requestId }, 500);
};

export const notFoundHandler: NotFoundHandler<{
  Bindings: Env;
  Variables: RequestIdVariables;
}> = (c) => c.json({ error: "Not Found", requestId: c.get("requestId") }, 404);
