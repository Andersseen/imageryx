import { createMiddleware } from 'hono/factory';

export type RequestIdVariables = {
  requestId: string;
};

/**
 * Assigns a unique ID to every request (reusing an inbound X-Request-Id if
 * a trusted upstream already set one) and echoes it back on the response
 * so client and server logs can be correlated.
 */
export const requestId = createMiddleware<{ Variables: RequestIdVariables }>(async (c, next) => {
  const id = c.req.header('X-Request-Id') ?? crypto.randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
});
