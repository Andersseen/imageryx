/**
 * `returnTo` travels from an untrusted query string, through a cookie, into a
 * `Location` header — the exact shape of an open redirect. Only a same-site
 * absolute *path* is ever allowed through; anything else silently becomes "/".
 *
 * Rejecting on an allow-list of shapes rather than by blocking known-bad
 * prefixes: `//evil.com` and `/\evil.com` are both read as protocol-relative
 * URLs by browsers, and a raw CR/LF would let a crafted value inject a second
 * response header.
 */
export function sanitizeReturnTo(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (value.length === 0) return fallback;

  // Must be an absolute path. This alone rejects "https://evil.com" and any
  // other value carrying a scheme, plus bare relative paths like "settings".
  if (!value.startsWith("/")) return fallback;

  // "//host" and "/\host" are protocol-relative — same origin to a naive check,
  // a different site to a browser.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // Control characters, most importantly CR and LF (header injection) and NUL.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;

  return value;
}
