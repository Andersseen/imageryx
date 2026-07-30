import { constantTimeEqual } from "@imageryx/image-core";
import { createMiddleware } from "hono/factory";
import { UnauthorizedError } from "../lib/errors";
import type { RequestIdVariables } from "./request-id";

const BEARER_PREFIX = "Bearer ";

/**
 * Central authentication middleware for every `/v1/*` route (mounted once
 * in `index.ts`, never re-implemented per route). Compares the bearer
 * token against `env.IMAGERYX_API_KEY` with a constant-time comparison —
 * never `===`, which short-circuits on the first differing byte and can
 * leak timing information about how much of the key an attacker guessed
 * correctly. Never logs the header value, valid or not.
 */
export const requireApiKey = createMiddleware<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : null;

  if (!token || !constantTimeEqual(token, c.env.IMAGERYX_API_KEY)) {
    throw new UnauthorizedError(
      "A valid Authorization: Bearer <api key> header is required.",
    );
  }

  await next();
});
