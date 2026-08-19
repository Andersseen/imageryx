# Changelog

All notable changes to this project are documented in this file. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Personal Cloudflare Release Preparation

Prepares the feature-complete personal alpha for a real Cloudflare
deployment. Multi-tenancy, teams, billing and managed hosting remain out of
scope.

### Added

- DevAuth dashboard sign-in: Authorization Code + PKCE, state/nonce login
  transactions, server-side code exchange, Imageryx-owned HttpOnly session
  cookie, local logout, session endpoint and signed-out dashboard gate.
- Dashboard proxy session enforcement. Browser API calls now require a
  valid Imageryx session before the server injects
  `IMAGERYX_INTERNAL_API_KEY` or the legacy fallback credential.
- Database-backed API-key management: `GET /v1/api-keys`,
  `POST /v1/api-keys`, `DELETE /v1/api-keys/:id`, secure key generation,
  hash-only persistence, last-used updates, revocation tests and dashboard
  create/list/revoke UI.
- `docs/dev-auth-integration.md` with the exact DevFlare client
  registration and secret checklist for `clientId: "imageryx"`.
- Production-config validation (`assertSafeProductionSecrets` in
  `@imageryx/image-core`, wired as middleware in `api-worker` and
  `delivery-worker`): refuses every request when `APP_ENV=production` and
  `IMAGERYX_API_KEY`/`DOWNLOAD_SIGNING_SECRET` still match their known
  local-dev default values or are unset.
- `pnpm key:generate` — a small script printing one cryptographically
  random secret, never written to a file.
- SVG delivery responses now also set a script-blocking
  `Content-Security-Policy` (`apps/delivery-worker/src/lib/svg-headers.ts`)
  — relevant today, not hypothetical: every simulated variant is real SVG.
- Tests around the upload path, which had no cover for the parts that
  actually broke in production: `apps/dashboard/e2e/upload-flow.spec.ts`
  (SVG upload, a signature-rejected file reported with the API's own
  reason and nothing stored, folder/visibility/tags actually applied,
  multi-file batches, and a batch where one file is rejected while the
  rest succeed), the dashboard proxy's own behaviour
  (`src/server/lib/proxy/proxy-handler.spec.ts` — session gate, key
  injection, multipart body forwarded byte for byte, upstream error
  envelope passed through, unreachable upstream, hop-by-hop headers),
  `UploadService`'s polling edges (poll failure, timeout reported as still
  processing rather than as a failure, hidden-tab pause), the upload
  dialog's failure reporting, `AssetSettings` (only-changed-fields saves,
  slug-change confirmation) and `ThemeService`.
- Real binding-level tests for `R2StorageProvider`
  (`apps/api-worker/test/r2-storage-provider.spec.ts`) — previously
  untested against any real `R2Bucket`, since `packages/providers`' own
  tests run under plain Node. Found and fixed a real bug along the way:
  `put()` didn't buffer a `ReadableStream` body before handing it to R2,
  which rejects streams with no known length.
- A real concurrency test for variant generation
  (`apps/api-worker/test/variants.spec.ts`) using `Promise.all`, not
  sequential awaits — found and fixed a real bug: two genuinely
  simultaneous requests could return a 409 to the loser instead of the
  normal idempotent response (`generate-variant.service.ts` now catches
  `DuplicateVariantError` and re-reads the now-existing variant).
- `pnpm test:coverage` — per-package coverage (`@vitest/coverage-v8` for
  Node/jsdom packages, `@vitest/coverage-istanbul` for the three
  Workers-pool packages, since V8 coverage can't see into a real workerd
  isolate), with thresholds set at each package's actual measured
  baseline, not an arbitrary number.
- `pnpm test:a11y` — a Playwright + `@axe-core/playwright` smoke suite
  scanning 5 representative pages (Overview, Library, Upload, Asset
  details, Preset form). Found and fixed real issues, not just added
  coverage: a systemic WCAG AA color-contrast failure across two theme
  tokens (`--muted-foreground`, `--destructive`) affecting every page, and
  a real upstream `@voltui/components` bug — `<volt-label htmlFor="x">`
  never renders a working `for` attribute (its `ngpLabel` directive
  overrides it), silently unlabeling every native `<select>`/`<input>`
  it's paired with. Fixed on every page this suite scans by wrapping the
  control in a real `<label>` instead (implicit association, which
  doesn't depend on the broken `for`/`id` link); the same broken pattern
  still exists on ~26 other call sites across the dashboard, tracked as a
  known follow-up (README.md's "Current limitations").
- `.github/workflows/codeql.yml`, `dependency-review.yml`,
  `deploy-manual.yml` (a `workflow_dispatch`-triggered per-app redeploy,
  separate from `ci.yml`'s automatic push-to-main deploy); a new `a11y`
  job and a `Coverage` step added to `ci.yml`.
- Changesets, scoped to `@imageryx/sdk` and `@imageryx/angular` only
  (`.changeset/config.json`) — both still `private: true`; used for
  internal version planning, not npm publishing, until that's a
  deliberate decision.
- A skip-to-content link (`apps/dashboard/src/app/app.component.ts`).

### Fixed

- **Every upload in production failed with an opaque 500.**
  `api-worker`'s `getStorageProvider` ran the _full_ provider parse while
  passing only the two provider names, and that parse rejects a
  `TRANSFORMATION_PROVIDER=cloudinary` configuration unless Cloudinary
  credentials come with it — credentials this call never passed and this
  Worker does not need, since it stores bytes and never transforms them.
  Production sets `TRANSFORMATION_PROVIDER=cloudinary`, so
  `POST /v1/assets/upload` and the project-purge path both threw before
  reaching R2, while every local test passed under `mock`. Storage
  configuration is now parsed on its own (`parseStorageConfig` in
  `@imageryx/providers`), independent of transformation credentials, and
  `apps/api-worker/test/env.spec.ts` covers the production-shaped config
  directly.
- `GET /v1/diagnostics/providers` answered `valid: false` with a 500 on
  every production request (and so failed `pnpm smoke:production`'s
  authenticated checks) for the same reason: it ran the full provider parse,
  which demands Cloudinary credentials that live on `processing-worker` —
  the Worker that actually transforms — and are correctly absent from
  api-worker. `valid` now describes the storage configuration this Worker
  owns, `transformationProvider` reports the configured name, and
  `cloudinaryConfigured` reports whether _this_ Worker holds a complete
  credential triple. No credential value reaches the response body.
- The accessibility suite was measuring a frame of an animation, not the UI.
  `app-shell.component.ts` fades the whole shell in (`moveEnter="fade-up"`),
  so axe sampled every colour blended with the background and reported
  contrast failures for colours the browser never paints — the reason two
  selectors sat excluded in `e2e/accessibility.spec.ts` as "known, diagnosed,
  not-yet-resolved", and why the Overview scan failed intermittently
  depending on whether a project existed. The reported `#1d7dae` (4.44:1) is
  precisely the real `#006ca4` (5.56:1, sampled from a rendered pixel)
  composited at the fade's 0.886 opacity. Each scan now waits for every
  finite animation to finish, and **both exclusions are gone** — every
  element on those pages is held to the real AA threshold again. No palette
  change was needed.
- `apps/dashboard/src/server/routes/proxy/[...path].ts`: a `fetch()`
  rejection (api-worker unreachable) previously fell through to Nitro's
  own generic error page — a shape the SDK's error parser doesn't
  recognize, rendering a bare, unhelpful "Server Error" everywhere. Now
  returns the same JSON error envelope api-worker's own error handler
  uses.
- `packages/database/src/services/preset-persistence.service.ts` had zero
  test coverage; `packages/database/src/config/wrangler-config.ts`
  likewise — both real, previously-unverified code paths, now tested.

### Security

- The one critical finding from this phase's own audit: `wrangler.jsonc`'s
  `env.production` blocks (api-worker, delivery-worker) had
  `IMAGERYX_API_KEY`/`DOWNLOAD_SIGNING_SECRET` committed as plaintext
  `vars`, equal to their local-dev default values — found, fixed (moved to
  `.dev.vars`/`wrangler secret put`), and now structurally prevented from
  recurring by the production-config validation above. See SECURITY.md.

## Phase 4B: Asset Workspace, Presets, Processing, API & Settings

Recorded here after the fact, like Phase 3 below — see ROADMAP.md and
context.md's "Phase 4B decisions and limitations" for the authoritative
record.

### Added

- `apps/dashboard`: `/library/:assetId` (full asset workspace — preview,
  metadata, variant generation with scoped polling, before/after
  comparison, delivery snippets, signed downloads, activity timeline,
  settings); `/presets`, `/presets/new`, `/presets/:presetId` (one shared
  editor, a real provider-compatibility panel); `/processing`,
  `/processing/:jobId` (scoped per-row/per-job polling); `/api` (live
  developer reference); `/settings` (the same live config, read-only).
  Every route the original spec named is now real.

### Fixed

- Analog's file router silently nests a dynamic detail route as an
  unrenderable child whenever a list page and its detail folder share a
  name (`library.page.ts` next to `library/[assetId].page.ts`) — fixed by
  moving the list page to `library/index.page.ts` for every list+detail
  pair this phase added. The new `/api` page also collided with the
  dev-only proxy's own `/api` prefix — the proxy moved to `/proxy`. See
  context.md's "Phase 4B decisions and limitations" for the full
  mechanism; required reading before adding another dynamic route.

## Phase 4A: Dashboard Foundation

### Added

- `apps/dashboard`: a real `/library` route — grid and table views, search,
  folder/tag/processing-status/visibility/deleted filters, sorting,
  pagination, soft delete and restore. The whole view is derived from the
  URL, so a filtered library is a shareable, reloadable link.
- `apps/dashboard`: a real `/projects` route — project list with live
  aggregate counts, create/edit/delete via an accessible dialog, and
  folder/tag management for the selected project.
- `apps/dashboard`: the topbar's Phase 1 placeholders became functional —
  project switcher (selection persisted across sessions), asset search
  that navigates to `/library?q=…`, and a multi-file upload dialog that
  tracks each file through upload → processing → ready.
- `apps/dashboard/src/app/core`: shared data layer — `describeApiError`
  (normalizes every SDK error into a renderable, safe shape), `AsyncStore`
  (separates first load from refresh, drops superseded responses),
  `ProjectContextService`, `UploadService` (sequential uploads plus
  per-asset scoped polling), `NotificationService`, and pure formatters.
- `apps/dashboard/src/app/ui`: reusable page header, empty/error/loading
  states, copy button with announced confirmation, status badge (never
  colour alone), asset thumbnail, pager, modal controller and toast host.
- `apps/dashboard`: Angular component testing (Vitest, the Analog Angular
  plugin and jsdom, zoneless), with an in-memory API stub at the `fetch`
  boundary so tests exercise the real `@imageryx/sdk` rather than a mock of
  it. 171 dashboard tests.
- **Playwright end-to-end suite** (`apps/dashboard/e2e`, `pnpm test:e2e`) —
  new to this repo. Boots a real api-worker (D1 + R2, Miniflare-backed) and
  the real dashboard on isolated ports and an isolated
  `.wrangler-state-e2e`, then drives a browser through project creation,
  upload, metadata inspection, search, filtering, view switching, soft
  delete and restore. Added to CI as a required job.
- `packages/database`: `VariantRepository.listReadyPresetSlugsByAssetIds`,
  and `GET /v1/assets` now returns `readyPresetSlugs` per asset — so the
  library grid can render a thumbnail only where one actually resolves,
  instead of firing a speculative 404 per tile.

### Fixed

- `packages/sdk`: `HttpClient` could not accept a **relative** `baseUrl`.
  `new URL(path, "/api/")` throws — the WHATWG parser requires an absolute
  base — so every dashboard API call threw before reaching the network,
  including Phase 3's `/dev-flow`. `resolveRequestUrl` now resolves a
  relative base against the document origin, and fails with a named error
  outside a browser instead of guessing a host.
- `apps/dashboard`: notifications rendered nothing. The third-party toast
  service held the correct queue while the view stayed empty, and its
  component additionally required an overlay provider it could not get
  standalone (NG0201). Replaced with a dashboard-owned
  `NotificationService` + `ToastHost`, which also removes a permanent
  100 ms change-detection tick.

### Not included in this phase

`/library/:assetId`, `/presets`, `/processing`, `/api` and `/settings` are
still placeholders — they name what they will do and expose no controls.
See [ROADMAP.md](ROADMAP.md)'s Phase 4B.

## Phase 3: Functional Backend and Delivery Flow

Recorded here after the fact — Phase 3 shipped without a changelog entry.
Summarized from [ROADMAP.md](ROADMAP.md) and context.md, which are its
authoritative record.

### Added

- `api-worker`: real multipart upload, full CRUD for
  projects/folders/tags/presets/assets, idempotent variant generation,
  processing-job list/retry/cancel and `/v1/stats` — all behind Bearer auth
  on every `/v1/*` route.
- `processing-worker`: two real Queue-driven job handlers,
  `inspect-metadata` (real per-format dimension/alpha parsing) and
  `generate-variant` (a visibly-labeled simulated SVG, persisted through
  `StorageProvider`).
- `delivery-worker`: real originals and ready variants with correct
  ETag/Cache-Control/nosniff headers, plus HMAC-signed time-limited
  download tokens.
- `@imageryx/sdk` and `@imageryx/angular` shipped as real, tested packages;
  the dashboard gained the dev-only `/dev-flow` route.

## Phase 2: Domain, Persistence and Provider Foundations

### Added

- `packages/contracts`: full domain Zod schemas + inferred types
  (projects, folders, assets, presets/image-operations, variants,
  processing jobs, providers), organized by domain under `src/`.
- `packages/image-core`: provider-independent domain services — filename
  and logical-path normalization, MIME/magic-byte signature validation,
  SHA-256 checksums, preset normalization + deterministic hashing,
  transformation-chain validation, pure provider selection, and
  job/variant state machines. Zero Hono/Angular/Cloudflare/Cloudinary
  imports.
- `packages/database`: D1 schema (`migrations/0001_initial_schema.sql`,
  10 tables), 8 repository classes, 3 cross-table persistence services (2
  using real `db.batch()` atomicity), and a Miniflare-backed D1 test
  harness (`/testing` subpath) — tested against a real SQLite-backed D1,
  not mocks.
- `packages/providers`: `StorageProvider`/`TransformationProvider`
  interfaces; real `LocalStorageProvider` (filesystem, `/node` subpath),
  `R2StorageProvider` (compiles against the real binding, no request
  yet), deterministic `MockTransformationProvider`, and
  parameter-mapping-only `CloudflareImagesProvider`/`CloudinaryProvider`;
  a Zod-validated provider registry/config schema.
- `packages/test-utils`: domain fixture builders
  (`createProjectFixture`, `createAssetFixture`, etc.), plus (via `/node`)
  a re-exported D1 test database and a temporary storage directory
  helper.
- `apps/api-worker`: D1 binding (`env.DB`) and four
  `GET /v1/diagnostics/{domain,database,providers,seed}` routes reporting
  real local state, with tests running against a migrated local D1 (via
  `@cloudflare/vitest-pool-workers`' `applyD1Migrations`).
- Root scripts: `setup:local`, `db:migrate:local`, `db:seed:local`,
  `db:status:local`, and the explicitly-destructive `db:reset:local` /
  `storage:reset:local`, plus `storage:prepare:local`.
  `packages/database/scripts/seed.ts` seeds two projects, their folders,
  a shared tag set, all 6 system presets, and generated SVG fixture
  assets — reading `wrangler.jsonc` so it writes to the exact same local
  D1/storage state `wrangler dev` reads.
- Documentation updated for Phase 2: README, ARCHITECTURE (domain package
  boundaries, database schema, provider interfaces, storage-key strategy,
  preset hashing, provider-selection flow, local-mode architecture,
  Mermaid diagram), context.md (full decisions/limitations record),
  ROADMAP, `.env.example`.

### Not included in this phase

Real upload routes, real R2/Cloudflare Images/Cloudinary network calls,
public delivery routes, real Queue-driven transformation processing, the
SDK, the Angular image component, and any dashboard route beyond Phase
1's Overview page — see [ROADMAP.md](ROADMAP.md).

## Phase 1: Repository Foundation

### Added

- Monorepo structure: `apps/{dashboard,api-worker,delivery-worker,processing-worker}`,
  `packages/{contracts,database,image-core,providers,sdk,angular,test-utils,typescript-config,eslint-config}`,
  `tooling/scripts`.
- pnpm workspaces + Turborepo with `dev`, `build`, `lint`, `typecheck`,
  `test`, and `check` root scripts and correct task dependency graph.
- `api-worker`: Hono app with `GET /health`, `GET /v1/info`, request ID
  middleware, structured logging, CORS, and central error handling.
- `delivery-worker`: Hono app with `GET /health` and a code-generated SVG
  `GET /preview-placeholder`.
- `processing-worker`: health endpoint and a Cloudflare Queue consumer that
  acknowledges a typed placeholder job.
- `dashboard`: Analog + Angular 21 (zoneless, signals, `OnPush`) app shell
  — sidebar, mobile navigation, theme switcher, environment badge, user
  area — integrating Volt UI, Quartz Headless, Angular Movement, and
  Lumen Icons. Overview page polls real Worker health endpoints.
- Open-source repository scaffolding: README, ARCHITECTURE, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, ROADMAP, context.md, MIT LICENSE, GitHub issue
  templates, PR template, Dependabot config, and CI workflow.
- Minimal, meaningful tests for health routes, the placeholder delivery
  response, the Queue consumer, dashboard service-status mapping, and
  dashboard environment parsing.

### Not included in this phase

Uploads, storage/transformation provider implementations, database
repositories, and a functional Library/Projects/Presets/Processing/API/
Settings UI — see [ROADMAP.md](ROADMAP.md).
