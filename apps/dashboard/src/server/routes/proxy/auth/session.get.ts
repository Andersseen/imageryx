import { defineEventHandler, setResponseHeader } from "h3";
import { AuthConfigError } from "../../../lib/auth/config";
import {
  handleSession,
  type SessionResponse,
} from "../../../lib/auth/handlers";
import { resolveAuthDeps } from "../../../lib/auth/runtime";

/**
 * `GET /proxy/auth/session` — who is signed in, read from Imageryx's own cookie.
 *
 * DevAuth is never contacted here. That is the whole architectural point: after
 * the callback this app answers "who is this?" from its own signed session, so
 * the identity provider is not on the request path.
 *
 * Unlike the other auth routes this one answers JSON rather than the HTML
 * failure page, including when auth is unconfigured — "nobody is signed in" is
 * the truthful answer for a caller that only wants to render a sign-in button.
 */
export default defineEventHandler(async (event): Promise<SessionResponse> => {
  setResponseHeader(event, "cache-control", "no-store");

  try {
    return await handleSession(event, resolveAuthDeps());
  } catch (error) {
    if (error instanceof AuthConfigError) {
      console.error(`[auth] not configured: ${error.message}`);
      return { authenticated: false, user: null };
    }
    throw error;
  }
});
