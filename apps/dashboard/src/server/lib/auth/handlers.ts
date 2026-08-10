import { getQuery, sendRedirect, type H3Event } from "h3";
import type { AuthRuntimeConfig } from "./config";
import type { DiscoveryDocument } from "./discovery";
import { renderAuthFailure } from "./failure";
import {
  clearLoginTransactionCookie,
  readLoginTransactionCookie,
  setLoginTransactionCookie,
} from "./login-transaction";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchUserInfo,
  TokenExchangeError,
  UserInfoError,
  type DevAuthIdentity,
} from "./oauth-client";
import {
  computeCodeChallengeS256,
  createCodeVerifier,
  createNonce,
  createState,
} from "./pkce";
import { sanitizeReturnTo } from "./return-to";
import {
  clearSessionCookie,
  getSessionUser,
  setSessionCookie,
  type SessionUser,
} from "./session";

/**
 * The route logic, kept out of the Nitro route files and given its collaborators
 * explicitly. That is what lets the unit tests drive a real `Request` through a
 * real h3 app with a stub `fetch` and a frozen clock, and assert things like
 * "no token exchange was attempted" — which is not observable if the handler
 * reaches for module-level globals.
 */

export interface AuthDeps {
  config: AuthRuntimeConfig;
  loadDiscovery: (issuer: string) => Promise<DiscoveryDocument>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Overridden only in tests, to make the authorization URL deterministic. */
  generate?: {
    state?: () => string;
    nonce?: () => string;
    codeVerifier?: () => string;
  };
  logger?: Pick<Console, "error" | "warn">;
}

function cookieOptions(deps: AuthDeps) {
  return {
    secret: deps.config.sessionSecret,
    secureCookies: deps.config.secureCookies,
    ...(deps.now ? { now: deps.now } : {}),
  };
}

export async function handleLogin(
  event: H3Event,
  deps: AuthDeps,
): Promise<string | void> {
  const query = getQuery(event);
  const returnTo = sanitizeReturnTo(query["returnTo"]);

  let discovery: DiscoveryDocument;
  try {
    discovery = await deps.loadDiscovery(deps.config.devAuth.issuer);
  } catch (error) {
    (deps.logger ?? console).error("[auth] discovery failed", error);
    return renderAuthFailure(event, "not_configured");
  }

  const state = (deps.generate?.state ?? createState)();
  const nonce = (deps.generate?.nonce ?? createNonce)();
  const codeVerifier = (deps.generate?.codeVerifier ?? createCodeVerifier)();
  const codeChallenge = await computeCodeChallengeS256(codeVerifier);

  await setLoginTransactionCookie(
    event,
    { state, nonce, codeVerifier, returnTo },
    cookieOptions(deps),
  );

  return sendRedirect(
    event,
    buildAuthorizationUrl({
      authorizationEndpoint: discovery.authorizationEndpoint,
      clientId: deps.config.devAuth.clientId,
      redirectUri: deps.config.devAuth.redirectUri,
      scope: deps.config.devAuth.scope,
      state,
      nonce,
      codeChallenge,
    }),
    302,
  );
}

export async function handleCallback(
  event: H3Event,
  deps: AuthDeps,
): Promise<string | void> {
  const logger = deps.logger ?? console;
  const query = getQuery(event);
  const transaction = await readLoginTransactionCookie(
    event,
    cookieOptions(deps),
  );

  // Read once, then drop unconditionally: the verifier is single-use, and an
  // abandoned transaction cookie is only ever a replay window.
  clearLoginTransactionCookie(event, cookieOptions(deps));

  // The provider refused before we ever get to look at a code. Surfaced as a
  // friendly page, never a 500, and the provider's own text is not echoed.
  const providerError = query["error"];
  if (typeof providerError === "string" && providerError.length > 0) {
    logger.warn(
      `[auth] DevAuth returned error=${providerError} description=${String(
        query["error_description"] ?? "",
      )}`,
    );
    return renderAuthFailure(
      event,
      providerError === "access_denied" ? "provider_denied" : "provider_error",
    );
  }

  const state = query["state"];

  // CSRF gate. Everything below this line — most importantly the token
  // exchange, which spends a single-use code and presents our client secret —
  // is unreachable unless the browser that arrived is the one that left.
  if (
    !transaction ||
    typeof state !== "string" ||
    state.length === 0 ||
    state !== transaction.state
  ) {
    logger.warn(
      "[auth] callback rejected: state did not match the login cookie",
    );
    return renderAuthFailure(event, "invalid_state");
  }

  // RFC 9207. DevAuth sends `iss` on the callback; when it is present it must be
  // the issuer we started with — cheap defence against a mix-up attack.
  const iss = query["iss"];
  if (typeof iss === "string" && iss.length > 0) {
    const normalized = iss.replace(/\/+$/, "");
    if (normalized !== deps.config.devAuth.issuer) {
      logger.warn(
        `[auth] callback rejected: iss "${iss}" is not the configured issuer`,
      );
      return renderAuthFailure(event, "invalid_state");
    }
  }

  const code = query["code"];
  if (typeof code !== "string" || code.length === 0) {
    return renderAuthFailure(event, "missing_code");
  }

  let discovery: DiscoveryDocument;
  try {
    discovery = await deps.loadDiscovery(deps.config.devAuth.issuer);
  } catch (error) {
    logger.error("[auth] discovery failed", error);
    return renderAuthFailure(event, "not_configured");
  }

  let identity: DevAuthIdentity;
  try {
    const tokens = await exchangeAuthorizationCode({
      tokenEndpoint: discovery.tokenEndpoint,
      clientId: deps.config.devAuth.clientId,
      clientSecret: deps.config.devAuth.clientSecret,
      redirectUri: deps.config.devAuth.redirectUri,
      code,
      codeVerifier: transaction.codeVerifier,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });

    identity = await fetchUserInfo({
      userinfoEndpoint: discovery.userinfoEndpoint,
      accessToken: tokens.accessToken,
      tokenType: tokens.tokenType,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });

    // `tokens` goes out of scope here, deliberately. DevAuth's access token is a
    // credential for DevAuth's API — it is not this app's session and is never
    // stored, forwarded, or put in a cookie.
  } catch (error) {
    if (error instanceof TokenExchangeError) {
      logger.error(
        `[auth] token exchange failed: ${error.message}`,
        error.detail,
      );
      return renderAuthFailure(event, "exchange_failed");
    }
    if (error instanceof UserInfoError) {
      logger.error(`[auth] userinfo failed: ${error.message}`, error.detail);
      return renderAuthFailure(event, "identity_failed");
    }
    logger.error("[auth] callback failed", error);
    return renderAuthFailure(event, "exchange_failed");
  }

  const user: SessionUser = {
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    picture: identity.picture,
  };

  await setSessionCookie(event, user, cookieOptions(deps));

  return sendRedirect(event, transaction.returnTo, 302);
}

export async function handleLogout(
  event: H3Event,
  deps: AuthDeps,
): Promise<void> {
  // Clears Imageryx's session only. DevAuth's own session is intentionally left
  // alone: this app never owned it, and RP-initiated logout at
  // `end_session_endpoint` would sign the user out of every other DevAuth client
  // too, which is a different (and much larger) action than "sign out here".
  clearSessionCookie(event, { secureCookies: deps.config.secureCookies });

  const query = getQuery(event);
  return sendRedirect(event, sanitizeReturnTo(query["returnTo"]), 302);
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
}

export async function handleSession(
  event: H3Event,
  deps: AuthDeps,
): Promise<SessionResponse> {
  const user = await getSessionUser(event, cookieOptions(deps));
  return { authenticated: user !== null, user };
}
