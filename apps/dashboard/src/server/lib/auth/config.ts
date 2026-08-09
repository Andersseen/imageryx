/**
 * Every value the DevAuth integration needs, read from the server-side
 * environment only. None of these names carry Vite's `VITE_` prefix, so none of
 * them can be inlined into client JS — the client secret and session secret
 * exist only in this Node/Worker context, exactly like `IMAGERYX_API_KEY` in the
 * sibling API proxy route.
 *
 * Nothing here defaults: a missing `DEV_AUTH_URL` should be a loud, specific
 * "auth is not configured" at the login route, not a silent fallback that sends
 * the browser to some other origin. (A localhost default would be actively
 * wrong here anyway — DevAuth's documented local issuer is port 8787, which is
 * the port this repo's own api-worker already binds.)
 */

export interface DevAuthConfig {
  /** Issuer origin, no trailing slash. Discovery hangs off this root. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Byte-for-byte the URI registered with DevAuth. */
  redirectUri: string;
  scope: string;
}

export interface AuthRuntimeConfig {
  devAuth: DevAuthConfig;
  sessionSecret: string;
  /**
   * `Secure` is derived from the redirect URI's scheme rather than from
   * `NODE_ENV`: it is the one value that already states, authoritatively,
   * whether this deployment is reached over TLS.
   */
  secureCookies: boolean;
}

/**
 * No `offline_access`: this app never calls DevAuth again after the callback, so
 * a refresh token would be a stored credential with no consumer. When the local
 * session expires the user is sent back through the (silent, if their DevAuth
 * session is still alive) authorization flow instead.
 */
export const DEFAULT_SCOPE = "openid profile email";

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

type EnvRecord = Record<string, string | undefined>;

function required(env: EnvRecord, key: string): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new AuthConfigError(`${key} is not set.`);
  }
  return value.trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function readAuthConfig(env: EnvRecord): AuthRuntimeConfig {
  const issuer = stripTrailingSlash(required(env, "DEV_AUTH_URL"));
  const redirectUri = required(env, "DEV_AUTH_REDIRECT_URI");

  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new AuthConfigError("DEV_AUTH_REDIRECT_URI must be an absolute URL.");
  }

  // DevAuth matches the redirect URI byte for byte. Catching a fragment or a
  // stray query here turns "the provider showed its own error page" — which
  // never reaches our callback, and so cannot be diagnosed from our logs — into
  // a startup-time message naming the exact problem.
  if (redirect.hash !== "" || redirect.search !== "") {
    throw new AuthConfigError(
      "DEV_AUTH_REDIRECT_URI must not contain a query string or fragment.",
    );
  }

  return {
    devAuth: {
      issuer,
      clientId: required(env, "DEV_AUTH_CLIENT_ID"),
      clientSecret: required(env, "DEV_AUTH_CLIENT_SECRET"),
      redirectUri,
      scope: env["DEV_AUTH_SCOPE"]?.trim() || DEFAULT_SCOPE,
    },
    sessionSecret: required(env, "SESSION_SECRET"),
    secureCookies: redirect.protocol === "https:",
  };
}
