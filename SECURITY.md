# Security Policy

## Supported Versions

Imageryx has not yet reached a tagged release (current status: personal-use
alpha, in Phase 5 hardening). Security fixes land on `main` only.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately using one of:

1. [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) for this repository ("Security" tab → "Report a vulnerability").
2. Email andriipap01@gmail.com with details and, if possible, reproduction steps.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (a minimal example is ideal).
- The affected app/package and version or commit.

## What to expect

- Acknowledgement within a few days.
- An assessment of severity and, if confirmed, a plan for a fix.
- Credit in the fix's changelog entry, unless you prefer to stay anonymous.

## Scope notes

`api-worker` has a real, meaningful attack surface — real authentication,
real multipart upload handling, real signed download tokens — and reports
about it are welcome:

- **Secrets are never committed, including in `wrangler.jsonc`.** An
  earlier revision of this repo briefly committed `IMAGERYX_API_KEY` and
  `DOWNLOAD_SIGNING_SECRET` as plaintext production `vars` — found and
  fixed in Phase 5 (moved to `.dev.vars`/`wrangler secret put`; see
  README's "Deployment" section). Both `api-worker` and `delivery-worker`
  now refuse to serve **any** request when `APP_ENV=production` and either
  secret is still set to its known local-development default value —
  `middleware/validate-production-env.ts`, backed by
  `@imageryx/image-core`'s `assertSafeProductionSecrets` — so this class of
  mistake fails loudly instead of deploying silently.
- **SVG delivery headers.** Every response whose `Content-Type` is
  `image/svg+xml` (originals and, today, *every* simulated variant — see
  "Upload validation" below) gets a restrictive
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
  sandbox` in addition to `X-Content-Type-Options: nosniff`, so an embedded
  `<script>` cannot execute even on a direct top-level navigation to the
  asset URL.

- **Authentication:** every `/v1/*` route requires `Authorization: Bearer
<IMAGERYX_API_KEY>`, compared with a constant-time algorithm
  (`@imageryx/image-core`'s `constantTimeEqual`). This is a **single
  shared static API key**, not per-user credentials — there is no
  authorization model, no key rotation, and no scoping yet. Treat any
  deployment of this phase as a trusted-operator tool, not a
  multi-tenant service; production auth/teams/billing is explicitly out of
  scope until a later phase (see [ROADMAP.md](ROADMAP.md)).
- **Signed downloads:** private/not-yet-public asset access goes through
  an HMAC-SHA256-signed, time-limited token
  (`createSignedToken`/`verifySignedToken`), never a bare base64 blob.
  `DOWNLOAD_SIGNING_SECRET` must be a real secret in any non-local
  environment — the `.env.example` default is explicitly a local-only
  placeholder value.
- **Non-disclosure of private/deleted assets:** `delivery-worker`'s
  path-based routes always return a generic 404 for private or
  soft-deleted assets, identical to a truly nonexistent path — existence
  of a private asset is never distinguishable from a 404 without a valid
  signed token.
- **Upload validation:** `api-worker` validates claimed MIME type,
  extension, and magic bytes (not just a trusted `Content-Type` header)
  before ever writing to storage, and enforces `MAX_UPLOAD_SIZE_MB`. SVG is
  accepted as an untrusted asset — flagged in `securityWarnings`, never
  sanitized, never rendered through `innerHTML` anywhere in the dashboard —
  and, since every simulated variant (`generate-variant`'s mock
  transformation) is itself rendered as real SVG bytes today, SVG delivery
  is the common case, not a rare edge case; see the CSP note above.
- **Path handling:** logical asset/folder paths are strictly validated
  against traversal, repeated separators, and encoded tricks
  (`@imageryx/image-core`); physical storage keys are always
  system-generated, never derived from user-supplied filenames or paths.
- **No secrets in dashboard UI:** the dashboard's `/api` reference page and
  `GET /v1/info` show only the configured key's first 8 characters plus a
  fixed mask (`apiKeyPrefix`) — enough to confirm which key is active,
  never enough to reconstruct it. Physical storage keys are never shown
  anywhere in the dashboard either (only the logical asset path).
- **Known, narrow limitation (not a vulnerability, but worth knowing):**
  `delivery-worker`'s route parser treats a literal `p` as the
  second-to-last path segment as a preset marker. An asset whose own
  logical path happens to have `p` as its second-to-last segment cannot
  be requested as an original through the plain delivery route — see
  context.md's "Delivery Worker route design" note. This is a routing
  ambiguity, not an access-control bypass (the misrouted request 404s or
  resolves to a different asset's variant, never bypasses visibility
  checks).
- **Key generation and rotation:** `pnpm key:generate` prints one
  cryptographically random secret (never written to any file); rotating
  either production secret is `wrangler secret put <NAME> --env production`
  with a freshly generated value — there is no downtime-free rotation
  scheme (rotating `IMAGERYX_API_KEY` invalidates every existing client
  immediately) since this is still a single shared key, not per-key
  credentials.
- **Not yet implemented:** rate limiting, per-key scoping (multiple,
  independently-revocable keys), audit logging beyond structured console
  output, and CSRF protection (moot today — the only authenticated caller
  is the SDK/dashboard proxy, never a browser form).

Reports about the local health-check endpoints, the dashboard's
server-side proxy (`server/routes/proxy/[...path].ts`), or the Delivery
Worker's public routes are welcome the same way.
