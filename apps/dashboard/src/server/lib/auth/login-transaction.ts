import { deleteCookie, getCookie, setCookie, type H3Event } from "h3";
import { readSignedToken, signToken } from "./signed-token";

/**
 * The short-lived record of one in-flight login: the `state` this browser
 * started with, the `nonce`, the PKCE verifier, and where to land afterwards.
 *
 * It lives in a cookie on Imageryx's own domain because the callback arrives as
 * a fresh top-level navigation from DevAuth — there is no other channel that
 * connects the request that left with the request that comes back.
 *
 * `SameSite=Lax` is load-bearing, not boilerplate: `Strict` would withhold the
 * cookie on exactly this cross-site top-level navigation, and the callback would
 * then fail its own state check every single time. `Lax` still sends it on a
 * top-level GET, which is what the redirect back is.
 *
 * Signed with the same secret as the session so a forged cookie — from a
 * neighbouring subdomain, say, which is not blocked by `HttpOnly` — cannot seed
 * a verifier or a state of the attacker's choosing.
 */

export const LOGIN_TX_COOKIE = "imgx_auth_tx";

/** Long enough to sign in (including a first-time DevAuth sign-up), short enough
 * that an abandoned attempt does not linger. */
export const LOGIN_TX_TTL_SECONDS = 10 * 60;

/** Scoped to the auth routes: nothing else has any business receiving it. */
export const LOGIN_TX_PATH = "/proxy/auth";

export interface LoginTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

interface LoginTransactionPayload extends LoginTransaction {
  exp: number;
}

export interface LoginTransactionOptions {
  secret: string;
  secureCookies: boolean;
  ttlSeconds?: number;
  now?: () => number;
}

function isLoginTransactionPayload(
  value: unknown,
): value is LoginTransactionPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["state"] === "string" &&
    typeof candidate["nonce"] === "string" &&
    typeof candidate["codeVerifier"] === "string" &&
    typeof candidate["returnTo"] === "string" &&
    typeof candidate["exp"] === "number"
  );
}

export async function setLoginTransactionCookie(
  event: H3Event,
  transaction: LoginTransaction,
  options: LoginTransactionOptions,
): Promise<void> {
  const now = options.now ?? Date.now;
  const ttlSeconds = options.ttlSeconds ?? LOGIN_TX_TTL_SECONDS;

  const payload: LoginTransactionPayload = {
    ...transaction,
    exp: Math.floor(now() / 1000) + ttlSeconds,
  };

  setCookie(event, LOGIN_TX_COOKIE, await signToken(payload, options.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secureCookies,
    path: LOGIN_TX_PATH,
    maxAge: ttlSeconds,
  });
}

export async function readLoginTransactionCookie(
  event: H3Event,
  options: LoginTransactionOptions,
): Promise<LoginTransaction | null> {
  const payload = await readSignedToken<unknown>(
    getCookie(event, LOGIN_TX_COOKIE),
    options.secret,
  );
  if (!isLoginTransactionPayload(payload)) return null;

  const now = options.now ?? Date.now;
  if (payload.exp * 1000 <= now()) return null;

  return {
    state: payload.state,
    nonce: payload.nonce,
    codeVerifier: payload.codeVerifier,
    returnTo: payload.returnTo,
  };
}

/** Always called once the callback has read it — success or failure. A verifier
 * is single-use, and leaving it around only widens the window for a replay. */
export function clearLoginTransactionCookie(
  event: H3Event,
  options: Pick<LoginTransactionOptions, "secureCookies">,
): void {
  deleteCookie(event, LOGIN_TX_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secureCookies,
    path: LOGIN_TX_PATH,
  });
}
