/**
 * OpenID Connect discovery. Endpoint paths are read from the issuer rather than
 * hardcoded, so a change on the DevAuth side (it is the same person's other
 * repo, and it does move) does not silently break this client.
 *
 * `fetchImpl` is injected the same way `@imageryx/providers`' Cloudinary adapter
 * takes one, which is what lets the unit tests cover this with no network.
 */

export interface DiscoveryDocument {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  endSessionEndpoint: string | null;
}

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryError";
  }
}

/**
 * OIDC first — it is the only one of the two that is required to advertise a
 * `userinfo_endpoint`, which is the identity source this client uses. The
 * OAuth 2.0 metadata document is a fallback for the case where DevAuth serves
 * only that one.
 */
const DISCOVERY_PATHS = [
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
] as const;

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function readString(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseDiscovery(
  raw: Record<string, unknown>,
  expectedIssuer: string,
): DiscoveryDocument {
  const issuer = readString(raw, "issuer");
  if (!issuer) {
    throw new DiscoveryError("Discovery document has no issuer.");
  }

  // The issuer the document claims must be the issuer we asked. Otherwise a
  // misconfigured DEV_AUTH_URL would quietly hand the whole flow — including the
  // client secret at token exchange — to whatever host answered.
  if (stripTrailingSlash(issuer) !== stripTrailingSlash(expectedIssuer)) {
    throw new DiscoveryError(
      `Discovery issuer "${issuer}" does not match the configured DEV_AUTH_URL.`,
    );
  }

  const authorizationEndpoint = readString(raw, "authorization_endpoint");
  const tokenEndpoint = readString(raw, "token_endpoint");
  const userinfoEndpoint = readString(raw, "userinfo_endpoint");

  if (!authorizationEndpoint || !tokenEndpoint || !userinfoEndpoint) {
    throw new DiscoveryError(
      "Discovery document is missing an authorization, token or userinfo endpoint.",
    );
  }

  return {
    issuer: stripTrailingSlash(issuer),
    authorizationEndpoint,
    tokenEndpoint,
    userinfoEndpoint,
    endSessionEndpoint: readString(raw, "end_session_endpoint"),
  };
}

export interface DiscoveryLoaderOptions {
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Returns a loader that caches the parsed document for `ttlMs`. Discovery is
 * fetched once per login rather than once per request, but caching still keeps a
 * burst of logins from hammering the issuer, and a short TTL means a DevAuth
 * endpoint change is picked up without a redeploy here.
 */
export function createDiscoveryLoader(options: DiscoveryLoaderOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cached: {
    issuer: string;
    document: DiscoveryDocument;
    expiresAt: number;
  } | null = null;

  return async function loadDiscovery(
    issuer: string,
  ): Promise<DiscoveryDocument> {
    const normalized = stripTrailingSlash(issuer);
    if (cached && cached.issuer === normalized && cached.expiresAt > now()) {
      return cached.document;
    }

    const failures: string[] = [];

    for (const path of DISCOVERY_PATHS) {
      let response: Response;
      try {
        response = await fetchImpl(`${normalized}${path}`, {
          headers: { accept: "application/json" },
        });
      } catch (error) {
        failures.push(`${path}: ${(error as Error).message}`);
        continue;
      }

      if (!response.ok) {
        failures.push(`${path}: HTTP ${response.status}`);
        continue;
      }

      let raw: Record<string, unknown>;
      try {
        raw = (await response.json()) as Record<string, unknown>;
      } catch {
        failures.push(`${path}: response was not JSON`);
        continue;
      }

      const document = parseDiscovery(raw, normalized);
      cached = { issuer: normalized, document, expiresAt: now() + ttlMs };
      return document;
    }

    throw new DiscoveryError(
      `Could not load OpenID configuration from ${normalized} (${failures.join("; ")}).`,
    );
  };
}
