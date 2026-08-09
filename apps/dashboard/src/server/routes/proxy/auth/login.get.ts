import { handleLogin } from "../../../lib/auth/handlers";
import { defineAuthRoute } from "../../../lib/auth/runtime";

/**
 * `GET /proxy/auth/login` — the single "Continue with DevAuth" hand-off. There
 * is no local sign-up, password or email flow anywhere in this app by design:
 * account creation, password reset and GitHub linking all belong to DevAuth.
 *
 * Under `/proxy` because that is this app's Nitro `apiPrefix` (see
 * `vite.config.ts`) — in development, Analog's dev middleware forwards only that
 * prefix to the Nitro server, so a route anywhere else would exist in a built
 * deployment but 404 into the SPA locally.
 *
 * Accepts `?returnTo=/some/path` (same-site paths only — see `return-to.ts`).
 */
export default defineAuthRoute(handleLogin);
