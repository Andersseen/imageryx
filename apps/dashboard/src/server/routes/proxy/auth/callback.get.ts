import { handleCallback } from "../../../lib/auth/handlers";
import { defineAuthRoute } from "../../../lib/auth/runtime";

/**
 * `GET /proxy/auth/callback` — the registered redirect URI, byte for byte.
 * DevAuth matches it exactly: no prefix, no wildcard, no implicit trailing
 * slash, and a mismatch is refused on DevAuth's own error page without ever
 * reaching this route.
 *
 * Validates `state`, exchanges the code server side (verifier + client secret),
 * reads the identity, and hands the browser Imageryx's own session cookie.
 */
export default defineAuthRoute(handleCallback);
