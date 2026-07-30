import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "./request-id";

/**
 * Structured (JSON) request log, one line per request. Cloudflare's
 * observability pipeline parses JSON console output automatically, which
 * keeps log queries structured without a logging dependency.
 */
export const structuredLogger = createMiddleware<{
  Variables: RequestIdVariables;
}>(async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    }),
  );
});
