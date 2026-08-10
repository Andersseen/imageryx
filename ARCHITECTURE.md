# Architecture

This document describes how Imageryx's apps and packages fit together. The
application/route/API architecture below reflects the personal alpha moving
toward its first real Cloudflare release. See [ROADMAP.md](ROADMAP.md) for the phase breakdown
and [context.md](context.md) for product/technology decisions and the
detailed rationale behind the choices summarized here — in particular its
"Phase 3 decisions and limitations", "Phase 4A decisions and limitations",
"Phase 4B decisions and limitations", and "Phase 5 decisions and
limitations" sections, which this document only summarizes.

## Applications

```
apps/
  dashboard/          Analog + Angular 21 — project/asset management UI
  api-worker/          Cloudflare Worker (Hono) — public API entry point
  delivery-worker/      Cloudflare Worker (Hono) — asset delivery edge
  processing-worker/    Cloudflare Worker — transformation job runner
```

### dashboard

**Responsibility:** the human-facing control plane — browsing assets,
managing projects/presets, inspecting API usage, and showing whether the
rest of the system is healthy.

- **Phase 1:** application shell, navigation, theme, and an Overview page
  that polls every Worker's `/health` endpoint live. The other six routes
  are static "upcoming" placeholders.
- **Phase 3:** adds one dev-only route, `/dev-flow`, that drives the real
  backend end to end through `@imageryx/sdk`, itself routed through a
  same-origin server-side proxy (`server/routes/proxy/[...path].ts`, an
  Analog/Nitro h3 route) that injects the API key server-side — the browser
  never holds it.
- **Phase 4A:** `/library` and `/projects` are real. The library offers
  grid and table views, search, folder/tag/status/visibility/deleted
  filters, sorting, paging, soft delete and restore, with the entire view
  derived from the URL; `/projects` covers project CRUD plus folder and tag
  management. The topbar's project switcher, asset search and upload
  dialog are functional. Underneath sits a shared data layer
  (`src/app/core`): normalized API errors, an async store that separates
  first load from refresh and drops superseded responses, a root project
  context, an upload service with per-asset scoped polling, and
  notifications.
- **Phase 4B (current):** every remaining route is real. `/library/:assetId`
  is a full asset workspace (preview, info, variants + scoped polling +
  before/after comparison, delivery snippets, download links created on
  click, activity timeline, settings with dirty-state tracking).
  `/presets`, `/presets/new` and `/presets/:presetId` share one editor
  backed by the real `@imageryx/providers` capability check. `/processing`
  and `/processing/:jobId` poll per-row/per-page, never the whole list.
  `/api` is a live developer reference (health, masked API key, generated
  code examples); `/settings` mirrors the same live configuration,
  read-only. The dashboard's own file-based `/library` + `/library/:assetId`
  route pair required moving the list page to `library/index.page.ts` —
  see context.md's "Phase 4B decisions and limitations" for why a sibling
  `library.page.ts` + `library/[assetId].page.ts` silently never renders
  the child.
- **Personal release:** dashboard access is gated by DevAuth OIDC plus an
  Imageryx-owned session. The footer renders the signed-in identity, and
  the dashboard API page can create/revoke database-backed API keys.

### api-worker

**Responsibility:** the single public entry point. Owns auth, request
validation, and orchestration — it never touches image bytes directly and
never runs expensive processing inline in a route handler.

- **Phase 1:** `GET /health`, `GET /v1/info` only.
- **Phase 2:** adds a D1 binding and four read-only diagnostic routes.
- **Phase 3:** every `/v1/*` route requires `Authorization:
Bearer <api key>`. Full CRUD for
  projects, folders, tags, presets (+ preview), assets (+ multipart
  upload, move, tagging, activity, variant listing, delivery info, signed
  download-url issuance, soft delete/restore), variant generation
  (idempotent), processing-job management (list/retry/cancel), and an
  aggregate `/v1/stats` route. Upload writes go through the configured
  `StorageProvider` (R2 locally, via Miniflare); a job is persisted and
  dispatched to `processing-worker` — via a real Cloudflare Queue message
  by default, or inline under `waitUntil` in `PROCESSING_MODE=inline-local`
  — never processed synchronously in the request.
- **Personal release:** database-backed API keys are checked before the
  legacy static `IMAGERYX_API_KEY` fallback. `/v1/api-keys` supports list,
  create and revoke; complete keys are returned once and only hashes are
  stored.
- **Later phases:** project/preset-scoped activity as real rows (currently
  structured logs only — see context.md), richer job-listing pagination and
  more granular API-key authorization.

### delivery-worker

**Responsibility:** the read path. Serves original and transformed assets
to end users, cache-first, independent of `api-worker`'s request/response
cycle. Never an open image proxy — every path resolves to a specific
asset/variant this system produced.

- **Phase 1:** `GET /health` and a placeholder SVG route.
- **Phase 3 (current):** `GET /:projectSlug/assets/:assetPath[/p/:presetSlug]`
  resolves a public original or a `ready` preset variant, with correct
  ETag/Content-Length/Content-Type/Cache-Control and `nosniff`; private or
  soft-deleted assets always 404 (never a distinguishing status). A
  separate `GET /download/:token` route validates an HMAC-signed,
  time-limited token (issued by `api-worker`) for private or
  not-yet-public originals/variants — see "Signed downloads" in
  context.md. The old placeholder route is gone.
- **Later phases:** on-demand variant generation for a preset that hasn't
  been requested yet (today, a variant must already be `ready`; the
  delivery route never triggers processing itself).

### processing-worker

**Responsibility:** runs transformation jobs off the request path, so
`api-worker` and `delivery-worker` stay fast and don't block on CPU-heavy
image work. Consumes typed `{ jobId }` messages only — full payloads and
secrets are never put on the Queue; the handler re-reads everything it
needs from D1/storage by ID.

- **Phase 1:** `GET /health` plus a Cloudflare Queue consumer
  acknowledging one placeholder job shape.
- **Phase 3:** two real job handlers. `inspect-metadata` parses
  real dimension/alpha data from image headers (PNG/JPEG/GIF/WebP/SVG; AVIF
  reports `null` with a warning, never a fabricated value) and generates a
  deterministic placeholder. `generate-variant` renders a real, visibly
  "Simulated transformation" SVG (via the mock `TransformationProvider`'s
  deterministic sizing plus `@imageryx/image-core`'s renderer) and, when
  `persist: true`, writes it through `StorageProvider`. Failed jobs are
  classified retryable/non-retryable and respect
  `PROCESSING_MAX_ATTEMPTS`.
- **Personal release:** `CloudinaryProvider.transform()` performs the real
  upload/transform/fetch path and returns `simulated: false`; production
  still needs live credential and end-to-end deployment verification.

## Dashboard structure (Phase 4B)

```
apps/dashboard/src/app/
  core/          Framework-thin, mostly pure — the layer pages build on
    api/           describeApiError (safe, renderable error shape) + AsyncStore
    format/        Byte/dimension/date formatters, pure functions of their inputs
    library/       AssetQuery: the URL <-> filter <-> API-params mapping
    projects/      ProjectContextService (root) + pure selection rules
    uploads/       UploadService: sequential uploads, per-asset scoped polling
    notifications/ NotificationService: the toast queue
    assets/        AssetWorkspaceService (component-scoped) + pure view/format helpers
                   (preview zoom, variant view, comparison, download options, activity view)
    presets/       Form <-> ImageOperation[] mapping, real provider-compatibility check
    processing/    ProcessingQuery (URL state), the shared per-job poller, human-readable
                   job-type/input/result descriptions
    delivery/      Extra snippet builders (responsive HTML, raw SDK call, cURL upload)
    env/ health/ sdk/ theme/   (Phase 1/3, unchanged)
  ui/            Presentational, route-agnostic: page header, empty/error/loading
                 states, copy button, status badge, thumbnail, pager, modal, toasts
  shell/         Topbar, project switcher, global search, upload dialog
  pages/         Route components (Analog file-based routing) — a list route and its
                 dynamic detail route live as `<name>/index.page.ts` +
                 `<name>/[param].page.ts` siblings, never `<name>.page.ts` next to a
                 same-named folder (see "Later phases" note above)
  testing/       Component-test helpers: the fetch-boundary API stub, settle()
```

Three rules hold this together, each with a reason beyond tidiness:

- **`core/` never imports from `pages/` or `ui/`.** Everything in `core/`
  is either pure or a root service, which is what makes it testable
  without rendering anything — `asset-query`, `format` and
  `project-selection` have no Angular dependency at all.
- **The URL is the library's state.** Filters write to the URL and the URL
  drives the fetch, never the reverse, so a filtered view is a shareable
  link that survives reload and the Back button with no second copy of the
  state to keep in sync.
- **Errors are normalized once.** Every failure becomes an `ApiErrorInfo`
  via `describeApiError` and renders through `<ix-error-state>`, so a raw
  provider or SQL string can never reach the DOM and "Retry" only appears
  when retrying could actually help.

Component tests stub `fetch` and build a **real** `ImageryxClient` over
it, so they exercise the shipped SDK rather than a mock of it. The
Playwright suite (`apps/dashboard/e2e`) runs the same UI against a real
api-worker on isolated ports and an isolated `.wrangler-state-e2e`.

## Domain package boundaries

Strict, one-directional dependency graph — enforced by convention (there
is no build-time lint rule for it yet, so review new imports against this
by hand):

```
contracts  ->  (nothing — Zod + shared primitives only)
image-core ->  contracts
database   ->  contracts, image-core
providers  ->  contracts, image-core
test-utils ->  contracts, image-core, database, providers
sdk        ->  contracts, image-core
angular    ->  image-core   (deliberately not sdk or contracts — see below)
```

- `@imageryx/contracts` never imports `image-core`, `database`, or
  `providers` — it's the innermost package, pure Zod schemas and inferred
  types, organized by domain (`projects/`, `folders/`, `assets/`,
  `presets/`, `variants/`, `processing/`, `providers/`) rather than one
  flat file.
- `@imageryx/image-core` never imports `database`, Hono, Angular,
  Cloudflare, or Cloudinary — every function in it (filename/path
  normalization, MIME validation, checksums, preset hashing, provider
  selection) is a pure, runtime-independent function of its inputs. This
  is what makes it unit-testable without a Worker, a browser, or a
  database.
- `@imageryx/database` and `@imageryx/providers` are siblings — neither
  depends on the other. A future persistence-aware provider (unlikely, but
  the reason for the rule) would go through a service in `database`, not
  the other way around.
- Within `database` and `providers`, **Node-only code lives behind a
  separate subpath export**, never the main barrel: `@imageryx/database/testing`
  (Miniflare-backed D1 test harness, uses `node:fs`) and
  `@imageryx/providers/node` (`LocalStorageProvider`, uses `node:fs`).
  `@imageryx/test-utils` mirrors this with its own `/node` subpath. This
  is a real constraint, not tidiness: importing the main `@imageryx/providers`
  barrel from a Cloudflare Worker must never transitively pull in
  `node:fs`, or the Worker fails to type-check (and would fail to run —
  workerd has no real filesystem).
- `@imageryx/sdk` is a thin, framework-independent Fetch client — it
  depends on `contracts` (input/output shapes) and `image-core` (the
  shared delivery-URL builder, so the SDK and the Workers can never
  disagree on a delivery path), never on `database` or `providers`.
- `@imageryx/angular` deliberately depends on `image-core` only, **not**
  `@imageryx/sdk` — `<imgyx-image>` only ever needs to build a delivery
  URL string from inputs, never to call an authenticated API or hold a
  key, so it stays independent of the SDK's HTTP/auth surface entirely.

## Database schema overview

D1 (SQLite), schema in `packages/database/migrations/0001_initial_schema.sql`,
10 tables: `projects`, `folders`, `assets`, `tags`, `asset_tags`, `presets`,
`variants`, `processing_jobs`, `api_keys`, `asset_activity`.

- **Deletion strategy:** deleting a project cascades to everything under
  it. Deleting a folder cascades to its subfolder tree but **never** to
  assets (`assets.folder_id` is `ON DELETE SET NULL` — assets become
  root-level, never disappear). See context.md for the full rationale.
- **Uniqueness via partial indexes**, not composite `UNIQUE` columns,
  wherever `NULL` needs to participate meaningfully: sibling folder slugs
  (root vs. nested), active (non-deleted) asset paths, and the
  asset+preset-hash pair on `variants` (`DuplicateVariantError` is raised
  when this constraint fails, not a raw SQL error).
- **JSON columns are never trusted blindly on read.** `presets.operations`,
  `processing_jobs.input`, and `processing_jobs.result` are stored as
  `TEXT` (JSON) and re-validated against the same Zod schema used to
  accept them on write, every time a repository maps a row back to a
  domain object.
- **API keys never store a complete key** — only a prefix (for lookup) and
  a secure hash of the secret.
- Repository classes (`ProjectRepository`, `FolderRepository`,
  `AssetRepository`, `TagRepository`, `PresetRepository`,
  `VariantRepository`, `ProcessingJobRepository`, `AssetActivityRepository`)
  wrap all of this in `packages/database/src/repositories/` — always
  parameterized queries, always explicit row-mapping functions, never
  raw SQL built from concatenated user input.
- Three services (`AssetPersistenceService`, `PresetPersistenceService`,
  `VariantPersistenceService`) handle cross-table writes. Two of them use
  real `db.batch()` atomicity (asset+activity, variant+processing-job);
  see context.md for exactly why and where that stops being possible with
  D1's actual transaction model.

## Provider interfaces

`@imageryx/providers` defines two interfaces
(`packages/providers/src/storage/storage-provider.ts` and
`.../transformations/transformation-provider.ts`) and implements them:

| Interface                | Implementations                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageProvider`        | `R2StorageProvider` (real — all three Workers use it against a real, if locally Miniflare-simulated, `R2Bucket` binding as of Phase 3), `LocalStorageProvider` (real, filesystem, Node-only, `/node` subpath — Node tooling/tests only, unreachable from any Worker)              |
| `TransformationProvider` | `MockTransformationProvider` (real — persists real, visibly-labeled simulated image bytes when `persist: true`), `CloudflareImagesProvider` / `CloudinaryProvider` (real parameter-mapping functions; `transform()` always throws — reachable but inert without real credentials) |

A `ProviderRegistry` (`packages/providers/src/registry/provider-registry.ts`)
selects an implementation from validated env config
(`parseProviderConfig`, Zod-validated, fails fast on an invalid or
incomplete combination — e.g. Cloudinary selected without credentials).
The Workers-safe registry throws `ProviderUnavailableError` for
`storageProvider: 'local'`; `@imageryx/providers/node`'s registry adds
that case back for Node-only tooling.

## Storage-key strategy: logical path vs. physical key

Two deliberately incompatible identifier spaces (`@imageryx/image-core`):

- **Logical paths** (`profile/andrii`) describe where an asset lives in a
  project's _folder tree_ — user-facing, renameable, strictly validated
  (traversal, repeated separators, and encoded tricks are all rejected
  outright, never silently normalized).
- **Physical storage keys** (`originals/{projectId}/{assetId}/original.{ext}`,
  `derived/{projectId}/{assetId}/{presetHash}.{ext}`) are opaque,
  provider-facing, and built only from our own generated identifiers —
  never from a logical path or a raw filename.

Keeping these separate is what lets a folder or asset be renamed without
moving a single byte in storage.

## Preset normalization and hashing

A preset's `operations` array is normalized (`@imageryx/image-core`'s
`normalizePreset`) before hashing: equivalent definitions (an omitted
optional field vs. its explicit default, `#fff` vs `#ffffff`) collapse to
the same canonical JSON, then SHA-256 (`hashPreset`) — deterministic, and
provider-specific mapping output never feeds into it. Operation _order_ is
preserved, not sorted — order is semantically significant for an image
pipeline. This hash is what `VariantRepository`'s uniqueness constraint
and `buildVariantObjectName`/`buildDerivedStorageKey` key off of, not the
preset's slug (a preset can be renamed without invalidating its
already-generated variants).

## Provider-selection flow

`selectTransformationProvider` (`@imageryx/image-core`) is a pure function
of the request and each candidate's declared capabilities:

```mermaid
flowchart TD
  A[Request: operations + format] --> B{External providers enabled?}
  B -- no --> C[mock]
  B -- yes --> D{Cloudflare supports full request?}
  D -- yes --> E[cloudflare]
  D -- no --> F{Cloudinary supports full request?}
  F -- yes --> G[cloudinary]
  F -- no --> H[UnsupportedOperationError, lists what's missing]
```

An explicit `preferredProvider` short-circuits this and is validated the
same way (throws if unregistered, disabled, or unsupported). Nothing is
ever silently dropped or downgraded.

## Local-mode architecture

Local development uses **one real D1 database and one real, locally
Miniflare-simulated R2 bucket**, shared by every process that touches
them — three separate `wrangler dev` processes (one per Worker), the seed
script, and `pnpm processing:run-local` all point at the same directory:

- Every Worker's `wrangler.jsonc` declares the same `DB` D1 binding
  (`database_name: imageryx-db`, `migrations_dir: ../../packages/database/migrations`)
  and `ASSET_STORAGE` R2 binding (`bucket_name: imageryx-storage`).
- Every `dev`/`db:migrate:local`/`db:status:local` script across all three
  apps, plus the seed script and `processing:run-local`, pass
  `--persist-to ../../.wrangler-state` (or construct a `Miniflare`
  instance with the equivalent `defaultPersistRoot`), so
  `.wrangler-state/v3/{d1,r2}` (git-ignored) is genuinely the single
  source of local state — an asset uploaded via `api-worker` is
  immediately visible to `processing-worker`'s Queue consumer and
  `delivery-worker`'s reads, confirmed working via live manual testing of
  the full pipeline across three concurrently-running processes.
- `pnpm db:seed:local` (`packages/database/scripts/seed.ts`) reads
  `api-worker`'s `wrangler.jsonc`, constructs a `Miniflare` instance with
  the identical bindings and persist root `wrangler dev` uses, and writes
  through the real repositories plus a real `R2StorageProvider` — not a
  separate copy of the data.
- `pnpm setup:local` chains storage-prepare → migrate → seed → status.
  `pnpm db:reset:local` / `pnpm storage:reset:local` are separate,
  explicitly destructive scripts with hard-coded path safeguards — neither
  runs as part of `setup:local`.

```mermaid
flowchart LR
  Contracts --> Core[Image Core]
  Core --> Database
  Core --> Providers
  API[api-worker] --> Database
  API --> Providers
  API -- Queue message: jobId only --> Processing[processing-worker]
  Processing --> Database
  Processing --> Providers
  Delivery[delivery-worker] --> Database
  Delivery --> Providers
  Providers --> R2[(R2 — Miniflare-simulated locally)]
  Providers --> MockTransformation[Mock Transformation]
  Providers -. mapping only, transform&#40;&#41; throws .-> CloudflareImages[Cloudflare Images]
  Providers -. mapping only, transform&#40;&#41; throws .-> Cloudinary
```

## Upload and processing flow

```mermaid
sequenceDiagram
  participant Client
  participant API as api-worker
  participant Storage as StorageProvider (R2)
  participant DB as D1
  participant Queue as PROCESSING_QUEUE
  participant Worker as processing-worker

  Client->>API: POST /v1/assets/upload (multipart)
  API->>API: validateImageAsset, checksum, free-path search
  API->>Storage: put(originalKey, bytes)
  API->>DB: createAssetWithActivity + inspect-metadata job (queued)
  API->>Queue: send({ jobId })
  API-->>Client: 201 { asset, processingDispatch }
  Queue-->>Worker: { jobId }
  Worker->>DB: load job + asset by id
  Worker->>Storage: get(originalKey)
  Worker->>Worker: inspectImageDimensions(mimeType, bytes)
  Worker->>DB: update asset (width/height/hasAlpha/placeholder), job -> succeeded, asset -> ready
```

## Variant generation flow

```mermaid
sequenceDiagram
  participant Client
  participant API as api-worker
  participant DB as D1
  participant Queue as PROCESSING_QUEUE
  participant Worker as processing-worker
  participant Storage as StorageProvider (R2)

  Client->>API: POST /v1/assets/:id/variants { presetId }
  API->>DB: hashPreset -> look up existing (assetId, presetHash) variant
  alt already ready
    API-->>Client: 200 existing variant
  else already pending/processing
    API-->>Client: 202 existing variant + active jobId
  else no existing variant
    API->>DB: insert variant (pending) + generate-variant job (batch, atomic)
    API->>Queue: send({ jobId })
    API-->>Client: 202 { variant, jobId }
    Queue-->>Worker: { jobId }
    Worker->>DB: load job + asset + preset by id
    Worker->>Worker: renderSimulatedVariantSvg(name, preset, dims, format)
    alt persist: true
      Worker->>Storage: put(derivedKey, svgBytes)
    end
    Worker->>DB: update variant (checksum/size, -> ready), job -> succeeded
  end
```

## Delivery flow

```mermaid
flowchart TD
  A["GET /:projectSlug/assets/:assetPath (optionally /p/:presetSlug)"] --> B{Project + asset resolve?}
  B -- no --> N[404 — never distinguishes not-found from private/deleted]
  B -- yes --> C{Asset public and not deleted?}
  C -- no --> N
  C -- yes --> D{presetSlug present?}
  D -- no --> E[Serve original from StorageProvider]
  D -- yes --> F{Variant exists and status = ready?}
  F -- no --> N
  F -- yes --> G[Serve variant from StorageProvider]
  E --> H[ETag = checksum, Cache-Control: public max-age=3600 swr=86400]
  G --> I[ETag = checksum, Cache-Control: public max-age=31536000 immutable]

  J[GET /download/:token] --> K{HMAC signature valid?}
  K -- no --> L[400]
  K --> M{Expired?}
  M -- yes --> O[410]
  M -- no --> P{Asset exists, not deleted, downloads enabled?}
  P -- no --> N
  P -- yes --> Q[Serve original or variant — Cache-Control: private, no-store]
```

All three flows are implemented as of Phase 3 and verified against real,
concurrently-running local Workers — not just isolated unit tests. See
context.md's "Phase 3 decisions and limitations" for the full detail
behind each step (upload consistency guarantees, idempotency, the
delivery-route `/p/` marker ambiguity, caching policy, etc.).

## Shared packages

| Package                              | Role as of Phase 4B                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts`                          | Full domain Zod schemas + inferred types (projects, folders, assets, presets, variants, processing jobs, stats, providers), organized by domain, plus the Phase 1 `HealthCheckResponse` shape                                                                                                                                                                                                                                                                                                |
| `image-core`                         | Provider-independent domain logic: filename/path normalization, MIME/signature validation, checksums, preset normalization + hashing, transformation validation, provider selection, job/variant state machines, **plus (Phase 3)** real per-format dimension inspection, HMAC signed tokens, constant-time comparison, the shared delivery-path/URL builder, simulated-variant SVG rendering, and placeholder generation                                                                    |
| `database`                           | D1 schema + migrations, repository classes (Phase 3 additions: bulk counts, folder subtree moves, tag CRUD, activity feeds; Phase 4A: ready-preset-slug lookup per asset), 3 cross-table persistence services; `/testing` subpath exposes a real Miniflare-backed D1 test harness                                                                                                                                                                                                            |
| `providers`                          | `StorageProvider`/`TransformationProvider` interfaces and implementations (local filesystem — Node-only, R2 — real, used by every Worker, mock transform — real, Cloudflare/Cloudinary parameter mapping) plus a validated-config provider registry; `/node` subpath adds the Node-only local storage provider                                                                                                                                                                               |
| `sdk`                                | Real, tested, framework-independent Fetch client (`createImageryxClient`) — typed resource namespaces, typed errors, FormData upload, delivery-URL/snippet helpers, and (Phase 4A) support for a **relative** `baseUrl` resolved against the document origin, which the dashboard's same-origin proxy depends on; (Phase 4B) `ServiceInfoResponse`/`PreviewPresetResponse` types and corrected `variants()`/`activity()`/`AssetDetails.processingJobs` return types (previously `unknown[]`) |
| `angular`                            | Real, tested standalone `<imgyx-image>` component — signal inputs/outputs, responsive preset support, no SDK or API-key dependency                                                                                                                                                                                                                                                                                                                                                           |
| `test-utils`                         | `isValidHealthCheckResponse` plus domain fixture builders and, via `/node`, a D1 test database + temporary storage directory helper, plus (Phase 3) real decodable-image fixtures (PNG/JPEG/GIF/WebP/SVG/AVIF) for metadata-inspection tests                                                                                                                                                                                                                                                 |
| `typescript-config`, `eslint-config` | Shared strict TS/lint configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Security boundaries

Summarized here; SECURITY.md has the full, current list. The load-bearing
ones for anyone extending this codebase: every `/v1/*` route requires
Bearer auth (constant-time comparison); a real HMAC-SHA256 signature (via
`crypto.subtle`, never homegrown) gates every signed download; production
deployments fail closed rather than open — `api-worker`/`delivery-worker`
refuse all traffic if `APP_ENV=production` and either secret still equals
its committed local-dev default; SVG is served with a script-blocking CSP
since it's accepted as untrusted content and never sanitized; the
dashboard's browser code never holds the API key — a same-origin
server-side proxy injects it — though that proxy is not yet verified to
run in the dashboard's current static-SPA production deployment (see
context.md's "Dashboard dev-only proxy" note).

## Future self-hosted model

Today, "self-hosting" means cloning this repo and deploying it as-is —
there's no packaged distribution. A real self-hosted offering (Roadmap's
"Future — Self-Hosted Mode") would need: the Workers/dashboard published
as installable units (not just source you fork), a setup flow that
provisions D1/R2/Queue resources rather than assuming
`docs/deployment-cloudflare.md` is followed by hand, and a clean split
between "this maintainer's own deployment" and "anyone's deployment" —
concretely, the production `wrangler.jsonc` resource names/IDs would need
to stop being hardcoded in this repo's own config.

## Future hosted (managed) model

Explicitly out of scope for every phase through Phase 5 (see ROADMAP.md).
Would require real multi-tenant authentication/authorization (replacing
the single shared static API key), per-tenant data isolation at the D1/R2
layer (today every table is a flat, single-tenant space keyed by
project — not tenant), and billing — none of which this architecture
currently has a seam for, by design, since building one prematurely would
constrain Phase 5's actual, narrower goal.
