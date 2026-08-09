/**
 * The three protocol calls this client makes: build the authorization URL,
 * exchange the code, read the identity.
 *
 * Identity comes from the **userinfo endpoint**, not from the ID token. Both are
 * acceptable per the integration contract; userinfo was chosen because the cost
 * is one server-side round trip at login only (never on the request path — the
 * local session takes over immediately afterwards), while the ID token route
 * would mean carrying a JOSE dependency, caching JWKS and handling ES256 key
 * rotation correctly forever, with a silent-acceptance failure mode if any of
 * `iss`/`aud`/`exp`/`nonce` were ever skipped. One round trip, once, is the
 * cheaper side of that trade for this app.
 *
 * Consequently the ID token is never decoded here. `nonce` is still sent (and
 * still round-tripped through the transaction cookie), so switching to ID-token
 * validation later is a local change to this file, not a protocol change.
 */

export interface AuthorizationUrlParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export class TokenExchangeError extends Error {
  /**
   * Provider-supplied detail. For server logs only — `callback.ts` never puts
   * this on a response, because it is attacker-influenceable text describing our
   * own credentials' failure mode.
   */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = "TokenExchangeError";
    this.detail = detail;
  }
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  idToken: string | null;
  expiresIn: number | null;
}

export interface ExchangeCodeParams {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}

/**
 * Confidential-client token exchange: PKCE verifier *and* client secret. Uses
 * `client_secret_post` (DevAuth accepts either that or `client_secret_basic`).
 * Runs server side only — the secret must never be in a browser.
 */
export async function exchangeAuthorizationCode(
  params: ExchangeCodeParams,
): Promise<TokenResponse> {
  const fetchImpl = params.fetchImpl ?? fetch;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetchImpl(params.tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });
  } catch (error) {
    throw new TokenExchangeError(
      "Token endpoint could not be reached.",
      (error as Error).message,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new TokenExchangeError(
      `Token endpoint returned HTTP ${response.status}.`,
      text.slice(0, 500),
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new TokenExchangeError(
      "Token endpoint did not return JSON.",
      text.slice(0, 500),
    );
  }

  const accessToken = raw["access_token"];
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new TokenExchangeError(
      "Token response carried no access token.",
      text.slice(0, 500),
    );
  }

  return {
    accessToken,
    tokenType:
      typeof raw["token_type"] === "string" ? raw["token_type"] : "Bearer",
    idToken: typeof raw["id_token"] === "string" ? raw["id_token"] : null,
    expiresIn: typeof raw["expires_in"] === "number" ? raw["expires_in"] : null,
  };
}

export class UserInfoError extends Error {
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = "UserInfoError";
    this.detail = detail;
  }
}

export interface DevAuthIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface FetchUserInfoParams {
  userinfoEndpoint: string;
  accessToken: string;
  tokenType?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchUserInfo(
  params: FetchUserInfoParams,
): Promise<DevAuthIdentity> {
  const fetchImpl = params.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(params.userinfoEndpoint, {
      headers: {
        authorization: `${params.tokenType ?? "Bearer"} ${params.accessToken}`,
        accept: "application/json",
      },
    });
  } catch (error) {
    throw new UserInfoError(
      "Userinfo endpoint could not be reached.",
      (error as Error).message,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new UserInfoError(
      `Userinfo endpoint returned HTTP ${response.status}.`,
      text.slice(0, 500),
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new UserInfoError(
      "Userinfo did not return JSON.",
      text.slice(0, 500),
    );
  }

  const sub = raw["sub"];
  if (typeof sub !== "string" || sub.length === 0) {
    // `sub` is the only claim this app keys anything on. Without it there is no
    // stable identity to attach a session to, so this is fatal rather than
    // something to paper over with the email address.
    throw new UserInfoError(
      "Userinfo response carried no sub claim.",
      text.slice(0, 500),
    );
  }

  const asString = (key: string): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  return {
    sub,
    email: asString("email"),
    name: asString("name") ?? asString("preferred_username"),
    picture: asString("picture") ?? asString("image"),
  };
}
