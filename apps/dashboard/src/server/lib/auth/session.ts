import { deleteCookie, getCookie, setCookie, type H3Event } from "h3";
import { readSignedToken, signToken } from "./signed-token";

/**
 * Imageryx's OWN session — the whole point of the DevAuth integration.
 *
 * After the callback this cookie is the only thing consulted to know who is
 * signed in. DevAuth is not called again: not to validate a token, not to
 * introspect, not to ask "who is this?". Its access token is deliberately
 * discarded at the end of the callback rather than stored or forwarded, because
 * it is a credential for *DevAuth's* API, not a session for this app.
 *
 * The session is a signed cookie rather than a row in a table because this
 * server tier has no datastore binding: it is a Node process under `vite` in
 * development and a Cloudflare Pages Worker when built, neither of which holds
 * the D1 binding that api-worker has. The trade is explicit — a signed cookie
 * cannot be revoked server-side before it expires, which is why the lifetime is
 * short rather than the usual month.
 */

export const SESSION_COOKIE = "imgx_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Keyed on `sub`: the one identifier stable across DevAuth's own sign-in
 * methods. Email is not — it can change, and GitHub linking means one person can
 * arrive by two routes. */
export interface SessionUser {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface SessionPayload extends SessionUser {
  iat: number;
  exp: number;
}

export interface SessionOptions {
  secret: string;
  secureCookies: boolean;
  ttlSeconds?: number;
  now?: () => number;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["sub"] === "string" &&
    candidate["sub"].length > 0 &&
    typeof candidate["exp"] === "number"
  );
}

export async function createSessionToken(
  user: SessionUser,
  options: SessionOptions,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const now = options.now ?? Date.now;
  const ttlSeconds = options.ttlSeconds ?? SESSION_TTL_SECONDS;
  const issuedAt = Math.floor(now() / 1000);

  const payload: SessionPayload = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };

  return {
    token: await signToken(payload, options.secret),
    maxAgeSeconds: ttlSeconds,
  };
}

export async function readSessionToken(
  token: string | undefined | null,
  options: SessionOptions,
): Promise<SessionUser | null> {
  const payload = await readSignedToken<unknown>(token, options.secret);
  if (!isSessionPayload(payload)) return null;

  const now = options.now ?? Date.now;
  if (payload.exp * 1000 <= now()) return null;

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

export async function setSessionCookie(
  event: H3Event,
  user: SessionUser,
  options: SessionOptions,
): Promise<void> {
  const { token, maxAgeSeconds } = await createSessionToken(user, options);
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secureCookies,
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/**
 * The session helper the rest of the app reads. Returns `null` for "not signed
 * in" — including for a tampered or expired cookie, which are not distinguished
 * on purpose.
 */
export async function getSessionUser(
  event: H3Event,
  options: SessionOptions,
): Promise<SessionUser | null> {
  return readSessionToken(getCookie(event, SESSION_COOKIE), options);
}

export function clearSessionCookie(
  event: H3Event,
  options: Pick<SessionOptions, "secureCookies">,
): void {
  deleteCookie(event, SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secureCookies,
    path: "/",
  });
}
