# Roadmap

This roadmap tracks phases, not dates. Each phase is only started once the
previous one is complete and its definition of done is met.

## Phase 1 — Repository Foundation ✅

- Monorepo structure (pnpm + Turborepo), shared TypeScript/ESLint configs.
- `dashboard`, `api-worker`, `delivery-worker`, `processing-worker` all
  start locally and expose real `/health` endpoints.
- Dashboard shell (Analog + Angular 21, zoneless) with live service-status
  polling on the Overview page.
- Placeholder packages (`contracts`, `database`, `image-core`, `providers`,
  `sdk`, `angular`, `test-utils`) exist as stable import paths for later
  phases.
- Open-source repository scaffolding (this file, CI, issue templates).

No uploads, storage, transformation, or database logic exists yet.

## Phase 2 — Domain, Persistence and Provider Foundations ✅

- `@imageryx/contracts` gets full domain schemas (projects, folders,
  assets, presets, variants, processing jobs) as Zod schemas + inferred
  types, organized by domain.
- `@imageryx/image-core` implements provider-independent domain logic:
  filename/logical-path normalization, MIME/signature validation,
  checksums, preset normalization + hashing, transformation-chain
  validation, and pure provider selection — no decode/resize/encode yet.
- `@imageryx/database` gets a real D1 schema, migrations, and repository
  classes (projects, folders, assets, tags, presets, variants, processing
  jobs, asset activity), tested against a real D1-compatible SQLite
  database, not mocks.
- `@imageryx/providers` gets a real `LocalStorageProvider` (filesystem),
  an `R2StorageProvider` structurally ready but making no real request,
  a deterministic `MockTransformationProvider`, and parameter-mapping-only
  `CloudflareImagesProvider` / `CloudinaryProvider` adapters.
- `api-worker` gains a D1 binding and `/v1/diagnostics/*` routes reporting
  real local domain/database/provider/seed state.
- `pnpm setup:local` prepares local storage, migrates, and seeds two
  projects, their folders/tags/system-presets, and a handful of generated
  SVG fixture assets — no committed binaries, no Cloudflare/Cloudinary
  account required for any command in this phase.

Still no upload API, delivery flow, real transformation pipeline, SDK, or
functional dashboard beyond Phase 1's Overview page — see context.md for
the exact Phase 3 starting point.

## Phase 3 — Functional Backend and Delivery Flow ✅

- `api-worker` gains real multipart upload routes (22-step validation and
  consistency flow), full CRUD for projects/folders/tags/presets/assets,
  idempotent variant-generation requests, processing-job list/retry/cancel,
  and an aggregate `/v1/stats` route — all behind Bearer auth on every
  `/v1/*` route.
- `processing-worker`'s Queue consumer runs two real job handlers:
  `inspect-metadata` (real per-format dimension/alpha parsing —
  PNG/JPEG/GIF/WebP/SVG; AVIF reports `null` with a warning, never a
  fabricated value — plus deterministic placeholder generation) and
  `generate-variant` (renders a real, visibly-labeled "Simulated
  transformation" SVG and persists it through `StorageProvider` when
  requested) — using `@imageryx/database`'s processing-job repository and
  the provider registry from Phase 2. Real local Cloudflare Queue delivery
  across separate `wrangler dev` processes, confirmed working via live
  testing.
- `delivery-worker` serves real originals and ready variants, cache-first,
  with correct ETag/Cache-Control/nosniff headers, visibility enforcement,
  and HMAC-signed time-limited private download tokens — replacing
  `/preview-placeholder`.
- `@imageryx/sdk` ships as a real, tested, framework-independent client;
  `@imageryx/angular` ships a real, tested `<imgyx-image>` component.
- The dashboard gains one dev-only `/dev-flow` route exercising the whole
  pipeline through a server-side proxy that keeps the API key out of
  browser code — no other dashboard route changes.
- All of the above runs **locally with zero Cloudflare or Cloudinary
  credentials**: local storage is a Miniflare-simulated R2 bucket shared
  across all three Workers via a common `--persist-to` directory, local
  Queues are real Cloudflare Queues simulated the same way, and
  transformation is the deterministic mock provider. The Cloudflare Images
  and Cloudinary adapters remain mapping-only — `transform()` still always
  throws; no real network call to either happens in this phase.

See context.md's "Phase 3 decisions and limitations" for the full detail,
including known gaps (AVIF dimension detection, folder-move not cascading
to descendant asset paths, project/folder/preset activity as logs rather
than rows, in-memory job-list pagination) and the exact Phase 4 starting
point.

Phase 4 is split in two. 4A builds the dashboard foundation every other
screen sits on; 4B builds the asset workspace and the remaining routes on
top of it.

## Phase 4A — Dashboard Foundation ✅

- **`/library` is real**: asset grid and table views, search, folder / tag
  / status / visibility / deleted filters, sorting, pagination, soft
  delete and restore — every dimension of the view encoded in the URL, so
  a filtered library is a shareable link that survives reload and the Back
  button.
- **`/projects` is real**: project list with live aggregate counts,
  create/edit/delete, plus folder and tag management for the selected
  project. The dashboard never sends `cascade=true`; a project that still
  holds assets is refused by the API and that refusal is surfaced, not
  worked around.
- **The topbar's three Phase 1 placeholders are now functional**: project
  switcher (with a persisted selection), asset search, and a real multi-file
  upload dialog that follows each file through upload → processing → ready.
- A shared dashboard data layer — normalized API errors, an async store
  that distinguishes first load from refresh and drops superseded
  responses, formatters, and a root project context.
- Real component tests (Angular TestBed, zoneless, jsdom) and a Playwright
  end-to-end suite that drives a real browser against a real api-worker,
  D1 and R2 — added from scratch; `pnpm test:e2e` did not exist before.
- Two real bugs fixed on the way: `@imageryx/sdk` could not accept the
  relative `baseUrl` the dashboard configures (so every dashboard API call
  — including Phase 3's `/dev-flow` — threw), and the toast component
  chosen for notifications rendered nothing. See context.md's "Phase 4A
  decisions and limitations".

`/presets`, `/processing`, `/api` and `/settings` remain deliberately
inert placeholders that name what they will do, rather than shipping
controls that do not work.

## Phase 4B — Asset Workspace and Remaining Routes ✅

- **`/library/:assetId` is real**: preview workspace, metadata, variant
  generation with scoped per-variant polling, an honestly-labeled
  before/after comparison, delivery URLs and snippets (HTML, responsive
  HTML, Angular, SDK), signed downloads created only on click, a
  human-readable activity timeline, and asset settings with dirty-state
  tracking. Library asset cards now link into it (closing the "cards are
  not links" limitation Phase 4A deliberately left open).
- **`/presets`, `/presets/new`, `/presets/:presetId` are real**: system vs.
  custom preset list, and one shared editor (resize/crop/output/effects)
  with a provider-compatibility panel backed by the real
  `@imageryx/providers` capability check and a real preset-preview call.
- **`/processing`, `/processing/:jobId` are real**: a filtered job list
  and per-job detail, both polling only the specific rows/job actually
  visible — never the whole list on a timer — with retry/cancel wired to
  the real state-transition rules.
- **`/api` is real**: live service health, a masked (never complete) API
  key, and copyable cURL/SDK/Angular/HTML examples generated from the real
  SDK against the selected project.
- **`/settings` is real**: the same live configuration `/api` reports,
  entirely read-only — there is no settings-mutation endpoint yet.
- Two real routing bugs fixed on the way: a same-named list-page-file +
  detail-folder pair silently nests the detail route as an unrenderable
  Angular Router child (affected every list+detail pair this phase added),
  and the new `/api` page collided with the dev-only proxy's own `/api`
  prefix. See context.md's "Phase 4B decisions and limitations" for the
  full mechanism and fix — required reading before adding another dynamic
  route.

Still deferred to Phase 5: API key management (Phase 3's auth is a single
shared static `IMAGERYX_API_KEY`; the `api_keys` table exists since Phase 2
but nothing writes to it yet), and project/folder/preset-scoped activity as
real rows instead of structured logs.

## Phase 5 — Production Hardening & Release (current)

- Real authentication/authorization on business routes — replacing Phase
  3's single shared static API key with per-user/per-team credentials
  (CI/CD and basic Cloudflare deployment already exist as of Phase 2 — see
  context.md, "Deployment" — but nothing deployed uses more than that
  static key yet).
- First tagged release; package publishing workflows for `@imageryx/sdk`
  and `@imageryx/angular`.
- A real transformation pipeline (or first real Cloudflare
  Images/Cloudinary network calls) replacing Phase 3's mock provider.

## Out of scope for now

Multi-region storage replication, video/animated-format transformation,
and a hosted managed offering are not planned in the phases above and will
only be scoped once Phase 5 ships.
