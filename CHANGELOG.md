# Changelog

All notable changes to this project are documented in this file. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Phase 4A: Dashboard Foundation

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
