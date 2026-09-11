import { ApiKeyRepository } from "@imageryx/database";
import {
  constantTimeEqual,
  extractApiKeyPrefix,
  hashApiKey,
} from "@imageryx/image-core";
import { createMiddleware } from "hono/factory";
import type { AppVariables } from "../lib/app-variables";
import { UnauthorizedError } from "../lib/errors";

const BEARER_PREFIX = "Bearer ";

/**
 * Central authentication middleware for every `/v1/*` route.
 *
 * Database-backed API keys are the primary path. The legacy static
 * `IMAGERYX_API_KEY` remains as an explicit migration fallback for bootstrapping
 * the personal deployment and for older local scripts. Never logs the header
 * value, valid or not.
 */
export const requireApiKey = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : null;

  if (!token) {
    throw new UnauthorizedError(
      "A valid Authorization: Bearer <api key> header is required.",
    );
  }

  const prefix = extractApiKeyPrefix(token);
  if (prefix) {
    const repository = new ApiKeyRepository(c.get("db"));
    const apiKey = await repository.findActiveByPrefix(prefix);
    if (
      apiKey &&
      constantTimeEqual(await hashApiKey(token), apiKey.hashedSecret)
    ) {
      c.executionCtx.waitUntil(repository.markUsed(apiKey.id));
      await next();
      return;
    }
  }

  if (!constantTimeEqual(token, c.env.IMAGERYX_API_KEY)) {
    throw new UnauthorizedError(
      "A valid Authorization: Bearer <api key> header is required.",
    );
  }

  await next();
});
