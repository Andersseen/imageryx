import { ImageryxValidationError } from "./errors";

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value);
}

/**
 * Resolves a request path against the client's `baseUrl`, supporting a **relative** base such as
 * `"/api"` and not only an absolute one.
 *
 * A relative base is the whole point of the dashboard's same-origin proxy pattern: the browser
 * calls `/api/v1/...` on its own origin and a server-side route injects the API key, so the key
 * never reaches client code (see README's "Authentication"). `new URL(path, base)` cannot do
 * this on its own — the WHATWG URL parser requires an *absolute* base and throws `Invalid URL`
 * for `new URL("v1/projects", "/api/")` — so the relative base is first resolved against the
 * current document origin.
 *
 * Outside a browser there is no origin to resolve against, and silently defaulting to some
 * placeholder host would turn a configuration mistake into a request sent somewhere unintended.
 * That case throws a named error instead.
 */
/**
 * `globalThis.location` is deliberately read through an explicit structural type rather than the
 * ambient DOM one. This package is type-checked inside every consuming app's own tsconfig — a
 * Worker's, a browser's, and plain Node's — and only some of those have the DOM lib; the same
 * source line otherwise resolves differently per consumer (see context.md, "Cross-runtime
 * ambient type friction"). Narrowing it here keeps every one of them compiling.
 */
function currentOrigin(): string | undefined {
  const location = (globalThis as { location?: { origin?: unknown } }).location;
  return typeof location?.origin === "string" && location.origin.length > 0
    ? location.origin
    : undefined;
}

export function resolveRequestUrl(baseUrl: string, path: string): URL {
  const base = `${baseUrl.replace(/\/+$/, "")}/`;
  const relativePath = path.replace(/^\/+/, "");

  if (isAbsoluteUrl(base)) return new URL(relativePath, base);

  const origin = currentOrigin();
  if (!origin) {
    throw new ImageryxValidationError(
      `baseUrl "${baseUrl}" is relative, which is only supported in a browser where it can be ` +
        "resolved against the current origin. Pass an absolute URL (e.g. http://localhost:8787) " +
        "when using the SDK outside a browser.",
    );
  }

  return new URL(relativePath, new URL(base, origin));
}
