import { defineEventHandler, send, setResponseStatus } from "h3";
import { setSessionCookie } from "../../../lib/auth/session";
import { resolveAuthDeps } from "../../../lib/auth/runtime";

/**
 * Deterministic E2E login. Disabled unless the Playwright server process sets
 * `E2E_AUTH=1`; production should never expose a route that can mint a session.
 *
 * This still creates a normal Imageryx session cookie, so every page and the
 * dashboard proxy exercise the real session read path after seeding.
 */
export default defineEventHandler(async (event) => {
  if (process.env["E2E_AUTH"] !== "1") {
    setResponseStatus(event, 404);
    return send(event, "Not Found");
  }

  const deps = resolveAuthDeps();
  await setSessionCookie(
    event,
    {
      sub: "e2e-user",
      email: "e2e@imageryx.test",
      name: "E2E Owner",
      picture: null,
    },
    {
      secret: deps.config.sessionSecret,
      secureCookies: deps.config.secureCookies,
    },
  );

  return { ok: true };
});
