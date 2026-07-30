# Security Policy

## Supported Versions

Imageryx is in Phase 3 (functional backend and delivery flow) and has not
yet reached a tagged release. Security fixes land on `main` only.

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

## Scope notes for Phase 3

As of Phase 3, `api-worker` has a real, meaningful attack surface — real
authentication, real multipart upload handling, real signed download
tokens — and reports about it are welcome:

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
  before ever writing to storage, enforces `MAX_UPLOAD_SIZE_MB`, and
  never executes or proxies raw SVG content as HTML — delivery responses
  always set `X-Content-Type-Options: nosniff`.
- **Path handling:** logical asset/folder paths are strictly validated
  against traversal, repeated separators, and encoded tricks
  (`@imageryx/image-core`); physical storage keys are always
  system-generated, never derived from user-supplied filenames or paths.
- **Known, narrow limitation (not a vulnerability, but worth knowing):**
  `delivery-worker`'s route parser treats a literal `p` as the
  second-to-last path segment as a preset marker. An asset whose own
  logical path happens to have `p` as its second-to-last segment cannot
  be requested as an original through the plain delivery route — see
  context.md's "Delivery Worker route design" note. This is a routing
  ambiguity, not an access-control bypass (the misrouted request 404s or
  resolves to a different asset's variant, never bypasses visibility
  checks).
- **Not yet implemented:** rate limiting, per-key scoping/rotation, audit
  logging beyond structured console output, and CSRF protection (moot
  today — the only authenticated caller is the SDK/dashboard proxy, never
  a browser form).

Reports about the local health-check endpoints, the dashboard's
server-side proxy (`server/routes/api/[...path].ts`), or the Delivery
Worker's public routes are welcome the same way.
