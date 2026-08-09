import { setResponseHeader, setResponseStatus, type H3Event } from "h3";

/**
 * Sign-in failures render a small self-contained page rather than a 500 (or
 * Nitro's generic error page, which is what an uncaught throw here would
 * produce).
 *
 * The message is chosen from this fixed table by a reason code the handler
 * decides — no string from DevAuth is ever interpolated into the response. That
 * covers two things at once: the provider's `error_description` is
 * attacker-influenceable text (a would-be injection vector), and the body of a
 * failed token exchange describes how *our own client credentials* were
 * rejected, which is a server-log detail and nobody's business in a browser.
 */

export type AuthFailureReason =
  | "not_configured"
  | "provider_denied"
  | "provider_error"
  | "invalid_state"
  | "missing_code"
  | "exchange_failed"
  | "identity_failed";

interface FailureCopy {
  status: number;
  title: string;
  message: string;
  canRetry: boolean;
}

const FAILURES: Record<AuthFailureReason, FailureCopy> = {
  not_configured: {
    status: 500,
    title: "Sign-in is not configured",
    message:
      "This deployment is missing its DevAuth settings. Check the server environment variables.",
    canRetry: false,
  },
  provider_denied: {
    status: 403,
    title: "Sign-in was declined",
    message:
      "You cancelled the sign-in, or DevAuth did not grant access to this account.",
    canRetry: true,
  },
  provider_error: {
    status: 400,
    title: "DevAuth could not complete the sign-in",
    message: "DevAuth returned an error instead of a sign-in result.",
    canRetry: true,
  },
  invalid_state: {
    status: 400,
    title: "This sign-in could not be verified",
    message:
      "The sign-in did not match the one this browser started, or it took too long. Start again from this device.",
    canRetry: true,
  },
  missing_code: {
    status: 400,
    title: "Incomplete sign-in",
    message: "DevAuth did not return an authorization code.",
    canRetry: true,
  },
  exchange_failed: {
    status: 502,
    title: "Sign-in could not be completed",
    message:
      "Imageryx could not complete the exchange with DevAuth. The details were written to the server log.",
    canRetry: true,
  },
  identity_failed: {
    status: 502,
    title: "Sign-in could not be completed",
    message:
      "Imageryx could not read your profile from DevAuth. The details were written to the server log.",
    canRetry: true,
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAuthFailure(
  event: H3Event,
  reason: AuthFailureReason,
): string {
  const copy = FAILURES[reason];

  setResponseStatus(event, copy.status);
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  // A failure page is per-request and carries a reason code; never let one be
  // stored and replayed to the next visitor.
  setResponseHeader(event, "cache-control", "no-store");

  const retry = copy.canRetry
    ? `<p><a class="action" href="/proxy/auth/login">Try signing in again</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)} — Imageryx</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
        background: Canvas; color: CanvasText; padding: 2rem;
      }
      main { max-width: 34rem; }
      h1 { font-size: 1.35rem; margin: 0 0 .6rem; }
      p { margin: 0 0 1rem; }
      .action { color: inherit; }
      .muted { opacity: .7; font-size: .9rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.message)}</p>
      ${retry}
      <p class="muted"><a class="action" href="/">Back to Imageryx</a></p>
    </main>
  </body>
</html>`;
}
