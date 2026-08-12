# Imageryx

[![CI](https://github.com/Andersseen/imageryx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Andersseen/imageryx/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E?logo=node.js&logoColor=white)](.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Angular](https://img.shields.io/badge/Angular-21-DD0031?logo=angular&logoColor=white)](https://angular.dev)

Imageryx is an open, provider-independent image delivery and
transformation platform: upload once, transform on request, and serve from
the edge — without locking storage or transformation logic to a single
vendor.

## Status: Phase 5 — Production Hardening

**Current status: personal-use alpha.** Feature-complete for a single-tenant,
self-hosted installation (Phases 1–4B); Phase 5 hardens what exists —
security, test coverage, CI, accessibility, documentation, and Cloudflare
deployment preparation — rather than adding new product surface. It does
not claim multi-tenant or production-service readiness; see "Current
limitations" below and [ROADMAP.md](ROADMAP.md).

Phase 1 shipped the monorepo structure and local dev experience. Phase 2
added the provider-independent image domain, a real D1 schema, and real
local storage / mock transformation providers. Phase 3 wired all of that
into a real, working vertical slice: create a project, upload an image
through a real multipart route, watch it get inspected by a real Cloudflare
Queue-driven `processing-worker`, request a preset variant (idempotent,
mock-transformed), and fetch it back through `delivery-worker` at a stable
public URL — plus a signed-download path for private assets, a
Bearer-auth-protected `/v1/*` API, a working `@imageryx/sdk` and a real
`<imgyx-image>` Angular component. Phase 4A put the first real UI on top of
it: `/library` browses, searches, filters, sorts and pages through your
assets with soft delete/restore; `/projects` manages projects, folders and
tags; the topbar's project switcher, asset search and multi-file upload
dialog all work end to end.

**Phase 4B** (current) fills in the rest of the dashboard. `/library/:assetId`
is a full asset workspace — preview, real metadata, variant generation with
scoped polling, before/after comparison (honestly labeled simulated),
delivery snippets (HTML/responsive HTML/Angular/SDK), signed downloads
created on click, a human-readable activity timeline, and settings with
dirty-state tracking. `/presets` lists system and custom presets and
`/presets/new` / `/presets/:presetId` share one real editor — resize, crop,
output format, effects, a live provider-compatibility panel backed by the
same `.supports()` capability check production uses, and a real
preset-preview call. `/processing` lists every real processing job with
per-row scoped polling and retry/cancel wired to the actual state-transition
rules, and `/processing/:jobId` gives each job its own live detail page.
`/api` is a live developer reference — real service health, a masked (never
full) API key, and copyable cURL/SDK/Angular/HTML examples generated
against whichever project is selected. `/settings` mirrors the same real,
live configuration, entirely read-only (there is no settings-mutation
endpoint yet). **All of it still runs locally with zero Cloudflare or
Cloudinary credentials.**

**Phase 5** (current) hardens that feature-complete base rather than adding
to it: production-config validation that refuses to serve traffic if a real
secret still equals its committed local-dev default, meaningful new test
coverage (including a real concurrency bug and a real third-party
accessibility bug found and fixed along the way — see context.md),
per-package coverage thresholds, an automated accessibility smoke suite,
CodeQL/dependency-review/a manual deploy workflow, and prepared (not yet
executed) Cloudflare deployment tooling.

There is still **no multi-user auth/teams/billing**. Human dashboard access
now goes through DevAuth (OAuth 2.1 / OIDC Authorization Code + PKCE) and an
Imageryx-owned session, while programmatic access remains API-key based.
Database-backed API keys can be created/revoked, with the legacy static
`IMAGERYX_API_KEY` kept as a bootstrap compatibility fallback. Cloudinary is
now implemented as the real transformation provider and covered by an
optional real-account health check; the full personal production image flow
still needs to be verified against live Cloudflare resources before this is
called a release. See
[ROADMAP.md](ROADMAP.md) for what's next and [context.md](context.md) for
the full working context, including the specific decisions and known
limitations from this phase.

## Stack

- **Monorepo:** pnpm workspaces + [Turborepo](https://turborepo.dev)
- **Backend:** [Hono](https://hono.dev) on Cloudflare Workers
- **Frontend:** [Analog](https://analogjs.org) + Angular 21 — standalone
  components, signals, zoneless change detection, `OnPush`, Tailwind CSS 4
- **UI libraries:** [Volt UI](https://volt-ui.andersseen.dev),
  [Quartz Headless](https://quartz-headless.pages.dev),
  [Angular Movement](https://github.com/Andersseen/angular-movement),
  [Lumen Icons](https://lumen-icons.dev)
- **Testing:** Vitest (+ `@cloudflare/vitest-pool-workers` for Workers)
- **Language:** TypeScript, strict mode, everywhere

## Monorepo structure

```
apps/
  dashboard/           Analog + Angular dashboard            → :5173
  web/                 Analog + Angular marketing site        → :5174
  api-worker/          Public API entry point (Hono)          → :8787
  delivery-worker/     Asset delivery edge (Hono)              → :8788
  processing-worker/   Queue consumer for transformation jobs  → :8789

packages/
  contracts/           Domain Zod schemas + inferred types, by domain
  database/            D1 schema/migrations/repositories (+ /testing subpath)
  image-core/          Provider-independent domain logic (validation, hashing,
                       metadata inspection, signed tokens, simulated rendering)
  providers/           Storage + transformation provider implementations (+ /node subpath)
  sdk/                 Framework-agnostic, typed API client (@imageryx/sdk)
  angular/             Real <imgyx-image> standalone Angular component
  test-utils/          Shared testing helpers + domain fixtures (+ /node subpath)
  typescript-config/   Shared strict tsconfig bases
  eslint-config/        Shared ESLint 9 flat configs

tooling/
  scripts/             Repository maintenance scripts
```

Every `apps/*` and `packages/*` entry above has its own README describing
what's implemented and what's deferred.

## Requirements

- Node.js **22+** (see `.nvmrc`)
- pnpm **9+** (`corepack enable` will get you the right version)

## Installation

```bash
git clone <this-repo-url>
cd imageryx
pnpm install
cp .env.example .env
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/delivery-worker/.dev.vars.example apps/delivery-worker/.dev.vars
```

## Commands

Run from the repository root; Turborepo fans these out to every app/package
with the matching script, respecting dependency order:

```bash
pnpm dev              # start dashboard + web + all three Workers concurrently
pnpm build            # production build of every app/package
pnpm lint             # ESLint across the workspace
pnpm typecheck        # TypeScript project-reference typecheck across the workspace
pnpm test             # Vitest (Node + Workers pools) across every app/package that has tests
pnpm test:unit        # Just the plain Vitest packages — excludes the three Workers pools
pnpm test:workers     # Just the @cloudflare/vitest-pool-workers suites (api/delivery/processing-worker)
pnpm test:integration # The plain-Node backend integration test (real D1 + R2, no mocks)
pnpm test:e2e         # Playwright: a real browser against a real api-worker, D1 and R2
pnpm test:a11y        # Playwright + axe-core: an accessibility smoke scan of 5 representative pages
pnpm test:coverage    # Per-package coverage against the thresholds in each vitest.config.ts
pnpm e2e:install      # One-time: download the Chromium build Playwright uses
pnpm check            # lint + typecheck + test + build, in dependency order (fast gate)
pnpm check:full       # check, then test:integration, test:e2e, test:a11y, test:coverage — strictly
                      # sequential (slow, complete gate)
```

`pnpm check` is the fast gate: lint + typecheck + test + build, fanned out
across packages by Turbo. Run it before every commit.

`pnpm check:full` is the complete gate: `pnpm check`, then
`test:integration`, `test:e2e`, `test:a11y`, `test:coverage`, run **one
after another** (`&&`-chained in the root `check:full` script), never in
parallel. `test:e2e` and `test:a11y` both drive the dashboard's Playwright
suite against the same `.wrangler-state-e2e` D1/R2 state (see below) — Turbo
would otherwise schedule them concurrently since neither declares a
`dependsOn` on the other in `turbo.json`, and two `wrangler dev` processes
writing to the same local D1 SQLite file at once fail with `SQLITE_BUSY`.
Chaining `check:full` with `&&` at the `pnpm` level (rather than
`turbo run test:e2e test:a11y`) is what guarantees they never overlap
locally. In CI this isn't an issue — `e2e` and `a11y` are separate GitHub
Actions jobs on separate runners/filesystems (see `.github/workflows/ci.yml`).
`test:integration` spins up its own ephemeral Miniflare D1/R2 pair (slower,
and intentionally isolated from the workerd-based `vitest-pool-workers`
suites that make up `pnpm test`; see context.md's "Backend integration
test" note for why).

`pnpm test:e2e` and `pnpm test:a11y` need no Cloudflare credentials. Both
apply migrations, then start api-worker on port 8887 and the dashboard on
5273 against `.wrangler-state-e2e` — deliberately separate from the dev
ports and from the `.wrangler-state` your `pnpm dev` session uses, so a run
can never upload into or delete from the database you are working in. Run
these one at a time locally — running one while another (or unrelated
`wrangler dev` processes against the same `--persist-to` state) is already
active produces false-positive failures from resource contention, not real
regressions; this was confirmed the hard way during Phase 5. `pnpm
check:full` already sequences this correctly; only be careful if you also
run `pnpm test:e2e` or `pnpm test:a11y` by hand in another terminal at the
same time.

**If a run is interrupted (Ctrl-C, crash, killed terminal) mid-way**, a
stale lock on `.wrangler-state-e2e`'s SQLite file can outlive the process
and make the next run fail with `SQLITE_BUSY` even though nothing is
running anymore. Before touching anything, confirm no relevant process is
actually still alive:

```bash
ps aux | grep -i '[w]rangler dev.*wrangler-state-e2e'
ps aux | grep -i '[p]laywright'
```

If either command prints a process, stop it (e.g. `kill <pid>`) — don't
delete state out from under a live process. Only once both commands print
nothing, and you've confirmed it's safe, remove the stale state directory:

```bash
rm -rf .wrangler-state-e2e
```

Treat that `rm -rf` as something to run deliberately yourself, not
something to script or automate — it deletes local E2E fixture state only
(never `.wrangler-state`, never anything production), but it's still a
destructive command worth a manual double-check of the `ps aux` output
first.

Run a single app's dev server from the root (useful when you only need one
piece running):

```bash
pnpm dev:dashboard   # dashboard only                → :5173
pnpm dev:web         # marketing site only            → :5174
pnpm dev:api         # api-worker only                → :8787
pnpm dev:delivery    # delivery-worker only           → :8788
pnpm dev:processing  # processing-worker only         → :8789
pnpm dev:workers     # all three Workers, no dashboard/web
```

Or target any single app/package directly:

```bash
pnpm --filter @imageryx/api-worker dev
pnpm --filter @imageryx/dashboard test
```

Drain any queued processing jobs without a live Queue consumer running
(reads/writes the same shared local D1 + R2 state as `wrangler dev`):

```bash
pnpm processing:run-local
```

## Authentication

Every `/v1/*` route on `api-worker` requires `Authorization: Bearer
<api key>`. Database-backed keys (`imgx_dev_...` locally,
`imgx_live_...` in production) are checked first and stored only as
hashes; the legacy static `IMAGERYX_API_KEY` (default locally:
`imgx_dev_local`) remains as an explicit bootstrap fallback.
`/health` (all three Workers) and `delivery-worker`'s public routes are
unauthenticated by design — delivery is meant to be fetched directly by
browsers/CDNs, never through a Bearer-token proxy.

The dashboard's browser code **never holds this key**. Every authenticated
dashboard page calls a same-origin server route
(`apps/dashboard/src/server/routes/proxy/[...path].ts`, an Analog/Nitro h3
route) that first verifies the Imageryx session, then injects
`IMAGERYX_INTERNAL_API_KEY` server-side and forwards to `api-worker`. Point
`@imageryx/sdk` at `/proxy` with no `apiKey` to use it; the SDK resolves a
relative `baseUrl` against the current origin specifically to support this.
Deliberately not `/api` — that's the dashboard's own API-reference _page_
route, and Analog's dev middleware mounts the whole Nitro proxy under one
configurable `apiPrefix` (`vite.config.ts`), so a same-named prefix would
shadow the page on a direct load or refresh. See context.md's "Dashboard
dev-only proxy" note for the full request path.

### User sign-in (DevAuth, OAuth 2.1 / OIDC)

The API key above authenticates the _dashboard_ to `api-worker`. Signing a
_person_ in is a separate concern, and Imageryx does not implement it: it is
an OAuth client of **DevAuth** (`https://auth-devflare.andersseen.dev`), a
standalone identity provider that owns credentials, GitHub sign-in and
account linking.

```text
Imageryx  →  DevAuth  →  GitHub
```

Imageryx never talks to GitHub directly, and has no local account model — no
sign-up, no password reset, no verification email. The entry point is a
single hand-off to DevAuth.

Four server routes, all under `apps/dashboard/src/server/routes/proxy/auth/`
(the `/proxy` prefix is Analog's `apiPrefix`, as above — in development only
that prefix reaches Nitro, so auth routes cannot live anywhere else):

```
GET  /proxy/auth/login      starts the flow (state + nonce + PKCE S256)
GET  /proxy/auth/callback   the exact registered redirect URI
POST /proxy/auth/logout     clears Imageryx's session
GET  /proxy/auth/session    who is signed in (JSON)
```

Endpoint paths are read from DevAuth's discovery document, never hardcoded.
The authorization code is exchanged **server side** with the PKCE verifier
and the client secret; identity comes from the `userinfo` endpoint.

The important part is what happens next: the callback creates **Imageryx's
own session** — an `HttpOnly`, `SameSite=Lax`, HMAC-signed cookie keyed on
DevAuth's `sub` claim — and from then on DevAuth is off the request path
entirely. No DevAuth cookie is read, no token is stored or forwarded, and
nothing asks the provider "who is this?" per request. `AuthSessionService`
(`src/app/core/auth/`) is how app code reads it.

Configure with `DEV_AUTH_URL`, `DEV_AUTH_CLIENT_ID`,
`DEV_AUTH_CLIENT_SECRET`, `DEV_AUTH_REDIRECT_URI` and `SESSION_SECRET` in
`apps/dashboard/.env` (git-ignored; copy `apps/dashboard/.env.example`, which
documents each one). Placeholder secrets are rejected before the browser is sent
to DevAuth. The redirect URI is matched byte for byte by DevAuth, and the client
must be registered there first; if DevAuth itself shows `invalid_client`, its
`OAUTH_CLIENTS` / `OAUTH_CLIENT_SECRETS` registration is still incomplete.

## API surface (`api-worker`, all under `/v1/*`, Bearer-auth required)

```
GET    /v1/info
GET    /v1/stats
GET    /v1/api-keys                      POST /v1/api-keys
DELETE /v1/api-keys/:id

GET    /v1/projects                       POST /v1/projects
GET    /v1/projects/:id                   PATCH /v1/projects/:id     DELETE /v1/projects/:id

GET    /v1/projects/:projectId/folders    POST /v1/projects/:projectId/folders
GET    /v1/folders/:id                    PATCH /v1/folders/:id      DELETE /v1/folders/:id

GET    /v1/projects/:projectId/tags       POST /v1/projects/:projectId/tags
PATCH  /v1/tags/:id                       DELETE /v1/tags/:id

GET    /v1/presets                        POST /v1/presets
GET    /v1/presets/:id                    PATCH /v1/presets/:id      DELETE /v1/presets/:id
POST   /v1/presets/:id/preview

POST   /v1/assets/upload                  GET  /v1/assets
GET    /v1/assets/:id                     PATCH /v1/assets/:id       DELETE /v1/assets/:id
POST   /v1/assets/:id/move                PUT  /v1/assets/:id/tags
POST   /v1/assets/:id/restore
GET    /v1/assets/:id/activity            GET  /v1/assets/:id/variants
GET    /v1/assets/:id/delivery            POST /v1/assets/:id/download-url
POST   /v1/assets/:id/variants                                       # request/generate a preset variant

GET    /v1/processing-jobs                GET  /v1/processing-jobs/:id
POST   /v1/processing-jobs/:id/retry      POST /v1/processing-jobs/:id/cancel

GET    /v1/diagnostics/domain             GET  /v1/diagnostics/database
GET    /v1/diagnostics/providers          GET  /v1/diagnostics/seed
```

## Delivery surface (`delivery-worker`, all public, no auth)

```
GET /health
GET /:projectSlug/assets/:assetPath                    # original, public assets only
GET /:projectSlug/assets/:assetPath/p/:presetSlug       # ready variant, public assets only
GET /download/:token                                    # signed, time-limited — private or not-yet-public assets
```

Private or soft-deleted assets always 404 on the plain path routes above
(never a distinguishing 403/410) — see context.md's "Visibility" note.
Issue a signed download token via `POST /v1/assets/:id/download-url`.

## Local URLs

| App                                   | URL                   |
| ------------------------------------- | --------------------- |
| Dashboard                             | http://localhost:5173 |
| API Worker                            | http://localhost:8787 |
| Delivery Worker                       | http://localhost:8788 |
| Processing Worker (HTTP dev endpoint) | http://localhost:8789 |

## Deployment

Every app deploys to Cloudflare — `dashboard` and `web` as Pages projects,
the three Workers as Cloudflare Workers:

| App               | Deploys to         | Production URL                                   |
| ----------------- | ------------------ | ------------------------------------------------ |
| dashboard         | Cloudflare Pages   | https://imageryx-dashboard.pages.dev             |
| web               | Cloudflare Pages   | https://imageryx-web.pages.dev                   |
| api-worker        | Cloudflare Workers | `imageryx-api-worker` (Workers subdomain)        |
| delivery-worker   | Cloudflare Workers | `imageryx-delivery-worker` (Workers subdomain)   |
| processing-worker | Cloudflare Workers | `imageryx-processing-worker` (Workers subdomain) |

`.github/workflows/ci.yml` runs a single `check` job (verify structure,
lint, typecheck, test, build) on every push and pull request. On a push to
`main`, once `check` passes, all five apps deploy as independent parallel
matrix jobs — a failure in one doesn't block the others. Deploys need the
repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
(`CLOUDFLARE_ACCOUNT_ID` must be the account that owns the Pages projects,
D1 database, R2 bucket, Queues, and Workers below). The API token must be
able to edit Cloudflare Pages, Workers Scripts, D1, R2, and Queues for that
account; add User Details read access too so Wrangler can identify the token
cleanly in CI logs.

Each matrix leg publishes to its own GitHub Environment
(`web (production)`, `dashboard (production)`, `api-worker (production)`,
…), so every deploy is recorded with its live URL under the repository's
**Environments** tab and in the sidebar. Add required reviewers or branch
protection rules per environment in **Settings → Environments** to gate any
individual app without touching the workflow.

Before the first deploy of `api-worker` or `delivery-worker`, set their
real secrets — `IMAGERYX_API_KEY` and `DOWNLOAD_SIGNING_SECRET` are **not**
committed as production `vars` (see `apps/api-worker/wrangler.jsonc` and
`apps/delivery-worker/wrangler.jsonc`); a Worker deployed without them set
will have `undefined` auth/signing secrets. `wrangler secret put` values
persist in Cloudflare across deploys, so this is a one-time step per
environment, from a machine authenticated with `wrangler login`:

```bash
# Generate strong random values, e.g.:
openssl rand -hex 32

# api-worker needs both:
pnpm --filter @imageryx/api-worker exec wrangler secret put IMAGERYX_API_KEY --env production
pnpm --filter @imageryx/api-worker exec wrangler secret put DOWNLOAD_SIGNING_SECRET --env production

# delivery-worker only verifies download tokens, so it only needs the signing secret —
# it MUST be the exact same value as api-worker's, or tokens issued by one
# will fail verification on the other:
pnpm --filter @imageryx/delivery-worker exec wrangler secret put DOWNLOAD_SIGNING_SECRET --env production
```

Each app also has its own `deploy` script for deploying manually from a
machine authenticated with `wrangler login`:

```bash
pnpm --filter @imageryx/dashboard run deploy
pnpm --filter @imageryx/web run deploy
pnpm --filter @imageryx/api-worker run deploy
pnpm --filter @imageryx/delivery-worker run deploy
pnpm --filter @imageryx/processing-worker run deploy
```

`api-worker` reads/writes the real `imageryx-db` D1 database in
production (separate from the `--local` database used by `wrangler dev`).
Apply new migrations before deploying code that depends on them:

```bash
pnpm --filter @imageryx/api-worker run db:migrate:production
pnpm --filter @imageryx/api-worker run db:status:production
```

Every `/v1/*` route on the deployed `api-worker` requires the same Bearer
`IMAGERYX_API_KEY` local requests do (see "Authentication" above) — set as
a real secret via `wrangler secret put`, not a plaintext `vars` value (see
"Deployment" secrets step above). `delivery-worker`'s routes are public by
design, not a gap — that's how a CDN-style delivery layer is meant to work.
What's still open: this is a single shared key, not per-user credentials
(see "Current limitations"), and the dashboard's own server-side proxy that
keeps this key out of browser code is not verified to run in the
dashboard's current static-SPA production deployment — see context.md's
"Dashboard dev-only proxy" note before relying on it in production.

## Local database & storage setup

`api-worker`, `processing-worker`, and `delivery-worker` each declare the
same D1 (`DB`) and R2 (`ASSET_STORAGE`) bindings in their own
`wrangler.jsonc`, and every `dev`/`db:*:local` script across all three (plus
the seed script and `processing:run-local`) points at the **same** shared
local persist directory — `--persist-to ../../.wrangler-state`
(git-ignored) — so an asset uploaded through `api-worker` is immediately
visible to `processing-worker`'s Queue consumer and `delivery-worker`'s
reads, all running as separate local processes. No real Cloudflare account
or credentials are needed — `wrangler dev`'s default (non-`--remote`) mode
simulates D1, R2, and Queues locally via Miniflare. One command sets
everything up and seeds two projects' worth of data:

```bash
pnpm setup:local
```

That's `storage:prepare:local` → `db:migrate:local` → `db:seed:local` →
`db:status:local`, each independently re-runnable and idempotent. The
individual commands:

```bash
pnpm storage:prepare:local  # ensures the shared .wrangler-state root exists
pnpm db:migrate:local        # wrangler d1 migrations apply (local, shared persist root)
pnpm db:seed:local           # seeds 2 projects, folders, tags, system presets, fixture assets — into the same shared R2 bucket every Worker reads from
pnpm db:status:local         # wrangler d1 migrations list (local)
```

Re-running `db:seed:local` is safe — it checks for existing rows before
inserting anything.

Two commands are **explicitly destructive** and never run as part of
`setup:local` or any other script:

```bash
pnpm db:reset:local       # wipes .wrangler-state/v3/d1
pnpm storage:reset:local  # wipes .wrangler-state/v3/r2
```

Seeded fixture assets are tiny, code-generated images (not committed
binaries) clearly labeled as local development fixtures in their `name`
field.

To exercise the full flow by hand, run `pnpm dev:workers` (or `pnpm dev`)
in one terminal and, in another:

```bash
curl -X POST http://localhost:8787/v1/assets/upload \
  -H "Authorization: Bearer imgx_dev_local" \
  -F projectId=<a project id from db:seed:local or GET /v1/projects> \
  -F file=@/path/to/image.png

# a few seconds later, once processing-worker has consumed the Queue message:
curl http://localhost:8787/v1/assets/<assetId> \
  -H "Authorization: Bearer imgx_dev_local"
```

Or do it in the UI: `pnpm dev`, then http://localhost:5173/library — pick a
project in the topbar, hit **Upload**, and watch the asset go from
uploading to processing to ready. Open the asset to reach its full
workspace (variants, delivery, download, activity). No API key is needed in
the browser, since the dashboard proxies through its own server (see
"Authentication" above). The dev-only `/dev-flow` page still exercises the
same lower-level pipeline directly against the SDK, useful when iterating
on the SDK itself rather than the dashboard UI.

## Diagnostic endpoints

`api-worker` exposes four read-only, Bearer-auth-protected routes
reporting real local state — no secrets, complete API keys, absolute
filesystem paths, internal storage keys, or raw database errors in any
response:

```http
GET /v1/diagnostics/domain      # supported formats/operations, dimension limits — no DB needed
GET /v1/diagnostics/database    # migrations applied, table row counts
GET /v1/diagnostics/providers   # configured providers + their capabilities
GET /v1/diagnostics/seed        # seed project/preset/asset counts
```

```bash
pnpm --filter @imageryx/api-worker dev   # in one terminal
curl http://localhost:8787/v1/diagnostics/database -H "Authorization: Bearer imgx_dev_local"
```

## Environment variables

See `.env.example` (repo root) for the full reference list and
`apps/dashboard/.env.example` for the `VITE_`-prefixed subset the
dashboard actually reads. Cloudflare Workers get their local non-secret
vars from each app's `wrangler.jsonc`, not from a `.env` file — see
`context.md` for why.

```env
APP_ENV=development
DASHBOARD_URL=http://localhost:5173
API_URL=http://localhost:8787
DELIVERY_URL=http://localhost:8788
IMAGERYX_API_KEY=imgx_dev_local
STORAGE_PROVIDER=r2
TRANSFORMATION_PROVIDER=mock
MAX_UPLOAD_SIZE_MB=25
ASSET_RECOVERY_DAYS=30
PROCESSING_MAX_ATTEMPTS=3
PROCESSING_MODE=queue
DOWNLOAD_SIGNING_SECRET=replace-with-local-development-secret
```

`ADVANCED_TRANSFORMATION_PROVIDER` and `CLOUDINARY_*`/`CLOUDFLARE_*` are
documented (empty) in `.env.example` for the future `cloudflare`/`cloudinary`
transformation configuration — not active, and no command in this phase
requires them. `LOCAL_STORAGE_PATH` still exists for `@imageryx/providers/node`'s
`LocalStorageProvider`, but no Worker uses it anymore (see "Provider
configuration" below).

Never commit a working `.env` file or real secrets — `.env*` (except
`*.example`) is git-ignored.

## Provider configuration

Storage and transformation backends are selected by env var, validated by
`@imageryx/providers`' Zod schema (`parseProviderConfig`) — an invalid or
incomplete combination fails fast rather than at first use:

| Var                                                                      | Local default    | Notes                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_PROVIDER`                                                       | `r2`             | `r2` is the only value any Worker uses locally — a real Miniflare-simulated R2 bucket, zero credentials required. `local` (filesystem) still exists for Node-only tooling/tests, not reachable from a Worker.   |
| `TRANSFORMATION_PROVIDER`                                                | `mock`           | `mock` (real, deterministic, persists real simulated-image bytes), `cloudflare` or `cloudinary` (mapping-only — `transform()` always throws, reachable but inert unless explicitly configured with credentials) |
| `ADVANCED_TRANSFORMATION_PROVIDER`                                       | unset            | Optional secondary provider (e.g. Cloudinary alongside a Cloudflare primary)                                                                                                                                    |
| `PROCESSING_MODE`                                                        | `queue`          | `queue` (real Cloudflare Queue, locally simulated) or `inline-local` (runs the same job function inside `waitUntil`, no Queue message) — see context.md                                                         |
| `DOWNLOAD_SIGNING_SECRET`                                                | dev-only default | HMAC key for signed private-download tokens — must be a real secret in any non-local environment                                                                                                                |
| `LOCAL_STORAGE_PATH`                                                     | `.local/storage` | Only read by Node-only tooling/tests now, never by a Worker                                                                                                                                                     |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | unset            | Required only when Cloudinary is configured as either transformation provider                                                                                                                                   |

## Current limitations

- No real network calls to Cloudflare Images, Cloudinary, or a real
  (non-Miniflare) R2 bucket — `CloudflareImagesProvider`/`CloudinaryProvider`'s
  `transform()` always throws; only `MockTransformationProvider` performs
  real (simulated) transformation work, producing real SVG image bytes,
  never fake JSON pretending to be an image. Every "simulated" label in the
  dashboard (variant badges, before/after comparison, preset preview)
  reflects this real provider state, not a guess.
- `@imageryx/image-core` still has no decode/resize/crop/encode pixel
  pipeline for _real_ transformation — variant generation is a real,
  visibly-labeled simulation, not a real resize.
- AVIF dimension inspection is unimplemented (reports `null`/`null` with a
  warning, never a fabricated dimension) — every other supported format
  (PNG/JPEG/GIF/WebP/SVG) parses real header bytes.
- Only `inspect-metadata` and `generate-variant` processing-job types have a
  real handler; the other five types are reachable-but-inert (see
  context.md's "Unimplemented processing-job types").
- There is no settings-mutation endpoint — `/settings` is entirely
  read-only, reporting the same live configuration `/api` does.
- No production authentication/authorization, teams, or billing — a single
  shared static Bearer API key protects `/v1/*`, which is the phase's
  explicit scope; see [SECURITY.md](SECURITY.md).
- CI deploys every app to Cloudflare on push to `main` (see "Deployment"
  above); the deployed api-worker/delivery-worker still expect the same
  local-style single static API key — no per-user credentials exist yet.
- A real, upstream `@voltui/components` bug (`<volt-label htmlFor>` never
  renders a working `for` attribute — see context.md's "Phase 5 decisions
  and limitations") was found and fixed on every page `pnpm test:a11y`
  scans; the same broken pattern still exists on other, not-yet-scanned
  dashboard pages (tags/folders panels, the processing list, the project
  dialog) — a known, diagnosed follow-up, not a hidden one.
- One color-contrast case (`ix-service-status-card`'s "solid"/"destructive"
  status badges) is excluded from the accessibility suite by exact
  selector with a documented root-cause writeup, not fixed — see the
  comment above `KNOWN_COLOR_CONTRAST_EXCLUSIONS` in
  `apps/dashboard/e2e/accessibility.spec.ts`.

See context.md's "Phase 3 decisions and limitations", "Phase 4A decisions
and limitations", and "Phase 4B decisions and limitations" sections for the
complete, detailed list (idempotency mechanism, delivery route ambiguity,
visibility model, caching policy, the URL-as-state library model, thumbnail
strategy, the file-router static/dynamic sibling-route pitfall, and more).

## Roadmap summary

Phase 1 repository foundation → Phase 2 domain, persistence & provider
foundations → Phase 3 functional backend & delivery flow → Phase 4A
dashboard foundation → **Phase 4B asset workspace & remaining routes (this
repo)** → Phase 5 production hardening & release. Full detail in
[ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please also read
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and, for vulnerabilities,
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE)
