# context.md

Working context for anyone (human or AI) picking up this repository. For
the phase breakdown see [ROADMAP.md](ROADMAP.md); for how the apps fit
together see [ARCHITECTURE.md](ARCHITECTURE.md).

## Product definition

Imageryx is an open, provider-independent image delivery and
transformation platform. Upload once, transform on request, serve from the
edge — without locking storage or transformation logic to a single vendor
(no direct R2/Cloudinary/etc. SDK calls outside the `providers` package).

## Current phase status

**Phase 1 — Repository Foundation, complete.** The monorepo structure
exists; the dashboard and all three Workers start locally; health
endpoints are real (not hardcoded); shared config, linting, and type
checking pass; production builds pass; the repo has initial open-source
structure. See [CHANGELOG.md](CHANGELOG.md) for the exact list.

**Phase 2 — Domain, Persistence and Provider Foundations, complete.** The
image domain (`contracts` + `image-core`) is fully specified and tested
independent of any runtime; `database` has a real D1 schema, migrations,
and repositories exercised against a real SQLite-backed D1, not mocks;
`providers` has a real local filesystem storage provider, an R2 provider
that compiles against the real binding type, a deterministic mock
transformation provider, and Cloudflare/Cloudinary parameter-mapping
adapters; `api-worker` exposes `/v1/diagnostics/*` routes backed by a real
local D1 database; `pnpm setup:local` seeds two projects end to end. See
"Phase 2 decisions and limitations" below for the specifics, and
[CHANGELOG.md](CHANGELOG.md) for the exact file list.

**Phase 3 — Functional Backend and Delivery Flow, complete.** Real
multipart upload, a real Queue-driven processing pipeline (metadata
inspection + mock variant generation), a real Delivery Worker (public
originals, ready variants, signed private downloads), a full `/v1/*`
project/folder/tag/preset/asset/variant/processing-job/stats API behind
Bearer auth, a working `@imageryx/sdk`, a real `<imgyx-image>` Angular
component, and a `/dev-flow` dashboard page that exercises the whole
pipeline through a server-side proxy. The full upload → processing →
variant → delivery flow works locally with zero Cloudflare or Cloudinary
credentials — see "Phase 3 decisions and limitations" below for exactly
how, and for what's still simulated or deferred. Do not start Phase 4 work
without re-reading ROADMAP.md and the Phase 3 implementation report first.

## Phase 2 decisions and limitations

Read this section before writing Phase 3 code that touches `contracts`,
`image-core`, `database`, or `providers` — several choices here are
deliberate simplifications, not oversights, and Phase 3 either builds on
them as-is or needs to consciously revisit them.

### Supported formats and domain limits

- Supported MIME types: `image/jpeg`, `image/png`, `image/webp`,
  `image/avif`, `image/gif`, `image/svg+xml`. Supported extensions: `jpg`,
  `jpeg`, `png`, `webp`, `avif`, `gif`, `svg`. `jpg`/`jpeg` are the only
  many-to-one case (`MIME_TYPE_TO_EXTENSIONS`); every other mapping is 1:1.
- Output raster formats (`OutputImageFormat`): `auto | avif | webp | jpeg |
png` — SVG is deliberately excluded as a generated _output_, only ever
  as a source/original.
- Dimension bounds: 1–8192px (`MIN_DIMENSION`/`MAX_DIMENSION` in
  `@imageryx/contracts`). Blur/sharpen use a normalized 0–100 domain range,
  mapped to each provider's own numeric range only inside that provider's
  adapter (never exposed to callers).
- Preset operation chains: at most 12 operations
  (`MAX_OPERATIONS_PER_PRESET`), at most one operation of any given type
  (this also implies at most one `format` and one `quality` operation —
  there's no separate "duplicate format" rule beyond the general
  duplicate-type check).

### Filename normalization decisions (`image-core/src/assets/normalize-filename.ts`)

- Unicode strategy: NFKD-normalize, then strip Latin combining diacritics
  (U+0300–U+036F) — `café` → `cafe`-equivalent before slugifying. Non-Latin
  scripts (Cyrillic, CJK, etc.) have no such decomposition and are **not**
  transliterated; they fall through the `[^a-z0-9]` filter entirely and hit
  the fixed fallback basename (`"image"`). This is a deliberate
  simplification — a real transliteration table is out of scope for this
  phase — and is deterministic, not random, so it's safe to build on.
  Revisit if Phase 3+ needs non-Latin filenames to round-trip meaningfully
  rather than collapse to a shared fallback.
- A claimed extension (from MIME detection) always wins over whatever
  extension is parsed out of the raw filename — never trust the raw name's
  extension alone.
- Repeated dots collapse to a single hyphen; a leading dot with no other
  extension (`.gitignore`-shaped names) keeps the whole name as the base,
  extension `null`.

### Logical path vs. physical storage key

Two distinct, deliberately incompatible identifier spaces:

- **Logical paths** (`image-core/src/paths/logical-path.ts`) describe
  _where an asset lives in the project's folder tree_ (`"profile/andrii"`).
  Normalization is strict, not lenient: `.`/`..` segments, repeated
  separators, backslashes, null bytes, percent-encoded sequences, and
  absolute paths are all **rejected outright**, never silently collapsed —
  a caller never gets back a path that means something different from what
  it typed. The empty string is the project root.
- **Physical storage keys** (`image-core/src/paths/storage-key.ts`) are
  opaque and provider-facing (`originals/{projectId}/{assetId}/original.{ext}`,
  `derived/{projectId}/{assetId}/{presetHash}.{ext}`, etc.), built only from
  our own generated identifiers — never from a logical path or raw
  filename. This is what lets a folder or asset be renamed without moving
  any bytes in storage. `assertOpaqueSegment` restricts every interpolated
  segment to `[A-Za-z0-9_-]+`; the local dev seed script relies on this
  accepting slugs (hyphens allowed), not just UUIDs.

### Database constraints and D1-specific decisions

- Deletion strategy (see the comment block at the top of
  `packages/database/migrations/0001_initial_schema.sql`): deleting a
  _project_ cascades to everything under it (whole-project delete).
  Deleting a _folder_ cascades to its subfolder tree but **never** to
  assets — `assets.folder_id` is `ON DELETE SET NULL`, so assets become
  root-level instead of disappearing.
- Sibling-slug and active-path uniqueness use **partial unique indexes**
  (`WHERE parent_id IS NULL` / `WHERE parent_id IS NOT NULL` for folders;
  `WHERE deleted_at IS NULL` for assets), not a single composite `UNIQUE`
  — SQLite treats every `NULL` as distinct for uniqueness purposes, so a
  naive composite constraint would silently allow duplicates.
- **No true multi-repository-call transactions.** D1's `.batch()` gives
  atomicity only for a fixed list of `D1PreparedStatement`s prepared
  up front, not for "read, then conditionally write" logic across
  repository calls. `AssetPersistenceService` and `VariantPersistenceService`
  use real `db.batch()` (each repository exposes an unexecuted
  `buildInsertStatement()` alongside its normal `create()`) for the two
  workflows where every value is knowable ahead of time (asset+activity,
  variant+processing-job — the latter's rollback-on-duplicate-variant is
  exercised by a real test). `PresetPersistenceService` is a thin wrapper
  with no second table to batch (asset_activity is asset-scoped, not
  project-scoped). Document this constraint again before assuming any
  future service call is atomic — check whether it actually uses `.batch()`.
- **System presets are always project-scoped**, matching `ImagePreset.projectId`
  being non-nullable. There is no global/tenant-less preset row. The seed
  script therefore creates each of the 6 system presets once **per seed
  project**, not once globally — migration `0001` intentionally contains no
  data, only schema, because a data-migration inserting presets would need
  a project row to reference and none exists yet at migration time.

### Local storage strategy

- `LocalStorageProvider` (`packages/providers/src/storage/local-storage.provider.ts`)
  is real, filesystem-backed, and **Node-only** — it cannot run inside a
  Cloudflare Worker (workerd has no real filesystem). It lives behind the
  `@imageryx/providers/node` subpath specifically so importing the main
  `@imageryx/providers` barrel from a Worker never pulls in `node:fs`. The
  same split exists in `@imageryx/database` (`/testing` subpath) and
  `@imageryx/test-utils` (`/node` subpath) for the same reason.
  `api-worker`'s own `STORAGE_PROVIDER=local` var is therefore honest about
  _configuration_ but the Worker itself never constructs a
  `LocalStorageProvider` — only the seed script and package tests do. If a
  future phase needs the Worker to serve local files, that requires a
  different mechanism (e.g. a local R2 simulator), not this provider.
- Metadata (content type, size, etag, upload time) has no filesystem-native
  home, so `LocalStorageProvider` keeps a `<key>.meta.json` sidecar next to
  every object.
- The local dev seed script (`packages/database/scripts/seed.ts`) and
  `wrangler dev`/`wrangler d1` share the _exact same_ on-disk D1 state: the
  seed script reads `apps/api-worker/wrangler.jsonc`'s `d1_databases[0]`
  (`binding` + `database_id`) and constructs a `Miniflare` instance with
  the identical `defaultPersistRoot` (`apps/api-worker/.wrangler/state/v3`)
  wrangler itself uses — confirmed empirically (`pnpm setup:local` then
  `wrangler dev` then `curl` the diagnostics routes all see the same rows).
  `wrangler.jsonc`'s top-level `database_id` now points at the real
  `imageryx-db` D1 database (created via `wrangler d1 create`, see
  "Deployment" below) — `--local` mode still only uses it as a key for the
  on-disk SQLite file, so local state stays independent of the remote
  database either way. Pulling this change resets your local D1 cache key;
  re-run `pnpm setup:local` if diagnostics routes come back empty.

### Provider-capability decisions

- Provider selection (`image-core/src/providers/provider-selection.ts`) is
  pure and deterministic: external providers disabled → `mock`; enabled and
  Cloudflare supports the full operation set → `cloudflare`; Cloudflare
  can't but Cloudinary can → `cloudinary`; nothing supports the full
  request → an explicit `UnsupportedOperationError` listing exactly what's
  missing. It never silently drops an operation or downgrades to a
  provider that can't do the job.
- **Cloudflare Images mapping gaps** (`packages/providers/src/transformations/cloudflare-images.provider.ts`):
  no pixel-offset manual crop (Cloudflare's `fit: 'crop'` is a
  gravity-based auto-crop-to-fit strategy, not an arbitrary
  x/y/width/height rectangle) and no grayscale parameter in the standard
  resizing API — both are excluded from `CLOUDFLARE_CAPABILITIES.supportedOperations`
  and rejected with `UnsupportedOperationError`, not silently ignored.
  `metadata: 'strip-location'` also has no Cloudflare equivalent (only
  "keep everything" or "strip everything") and is rejected the same way.
  Blur (0–250) and sharpen (0–10ish) domain-to-provider mappings are a
  chosen linear scale, not a value confirmed against a live account.
- **Cloudinary mapping** (`packages/providers/src/transformations/cloudinary.provider.ts`)
  supports the full operation set, including crop and grayscale — this is
  _why_ it's the fallback when Cloudflare can't do the job. Parameter names
  and ranges follow Cloudinary's public docs, not a live account (no real
  network calls exist in this phase); `metadata: 'strip-location'` is
  rejected here too (no documented GPS-only strip flag), for the same
  reason as Cloudflare. The signing function (`signCloudinaryParams`)
  implements Cloudinary's real algorithm (sorted param string + secret,
  SHA-1) and is unit-tested against its shape, but has never signed a
  request Cloudinary's API actually accepted.
- Both Cloudflare and Cloudinary provider classes exist (`CloudflareImagesProvider`,
  `CloudinaryProvider`) implementing the shared `TransformationProvider`
  interface, but their `transform()` methods always throw
  `ProviderUnavailableError` — Phase 2 explicitly excludes real network
  calls. Only `MockTransformationProvider.transform()` does real work
  (deterministic simulated results).

### Technical debt / compatibility workarounds

- **`@imageryx/providers`' `StorageProviderId`/`TransformationProviderId`**
  (the exact names `api-worker`'s `/v1/info` route and the dashboard's
  health-status types import) are now type aliases for the new
  `StorageProviderName`/`TransformationProviderName` from `@imageryx/contracts`.
  `TransformationProviderId`'s value set changed: Phase 1's unused
  `'in-house'` placeholder is gone, replaced by `'cloudflare'` — nothing in
  Phase 1 ever produced `'in-house'` as a real runtime value (it was cast
  from an env var string, never validated), so this is a safe rename, not
  a breaking change.
- **Cross-runtime ambient type friction.** Shared packages get
  type-checked _inside every consuming app's own tsconfig_ (Workers'
  wrangler-generated globals, the dashboard's DOM lib, plain Node for
  scripts/tests) — the same source file can hit a different ambient
  signature for `crypto.subtle.digest`, `TextDecoder`, or `ReadableStream`
  depending on who imports it, even though each package's own isolated
  `tsc --noEmit` passes. Fixed by making the affected call sites
  maximally explicit rather than relying on lib inference: `computeSha256Checksum`
  copies into a plain `ArrayBuffer` before calling `digest()`; the SVG
  sniffer's `TextDecoder` always passes both `fatal` and `ignoreBOM`
  explicitly; `R2StorageProvider` bridges its `ReadableStream` through a
  single documented `as unknown as` cast at the two points where R2's
  binding type and the shared `StorageBody` type disagree. If a future
  package hits a similar error only inside one consuming app's typecheck
  (not the package's own), suspect this same cause first.
- **D1 migrations in `@cloudflare/vitest-pool-workers` are not automatic.**
  Test D1 storage is isolated/ephemeral per run (unrelated to
  `.wrangler/state` used by `wrangler dev`/the seed script), so
  `apps/api-worker/vitest.config.ts` reads migrations via `readD1Migrations()`
  into a `TEST_MIGRATIONS` binding, and `test/apply-migrations.ts` (a
  `setupFiles` entry) calls `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`
  before any test runs. `env` from `cloudflare:test` is typed as
  `Cloudflare.Env`, not `ProvidedEnv` — augmenting the wrong interface
  compiles but silently doesn't apply; see `test/env.d.ts`'s
  `declare global { namespace Cloudflare { ... } }` for the working form
  (a bare `declare namespace Cloudflare` inside a file with a top-level
  `import` creates a module-local namespace, not a global augmentation).

### Security limitations carried into Phase 3

- SVG detection (`image-core/src/security/mime-validation.ts`) is a
  lightweight structural sniff (`<svg` prefix match on a short byte
  window) — it classifies SVG as untrusted and flags it in
  `securityWarnings`, but performs **no sanitization**. Any Phase 3 code
  path that serves SVG content back to a browser must sanitize or
  sandbox it first; this phase never claims otherwise.
- Magic-byte detection covers JPEG/PNG/GIF/WebP/AVIF/SVG only at the level
  needed to catch an obviously-mismatched claimed MIME type — it is not a
  full format validator (a truncated or malformed-but-correctly-signed
  file will still pass).

### Exact starting point for Phase 3

Everything needed to build real upload routes, a real transformation
pipeline, and real delivery already exists and is tested:
`@imageryx/database`'s repositories, `@imageryx/providers`' registry
(`createProviderRegistry`/`createStorageProvider`/`createTransformationProvider`),
and `@imageryx/image-core`'s validation/hashing/path utilities. Phase 3
should:

1. Add real multipart upload handling to `api-worker`, using
   `AssetPersistenceService.createAssetWithActivity` plus
   `image-core`'s `validateImageAsset`/`normalizeFilename`/`buildOriginalStorageKey`
   — the wiring, not the primitives, is what's missing.
2. Wire `processing-worker`'s Queue consumer to
   `ProcessingJobRepository`/`VariantPersistenceService` and a real
   `TransformationProvider.transform()` call (starting with `MockTransformationProvider`
   still being valid for local dev, then making `CloudflareImagesProvider`/`CloudinaryProvider`
   actually call their respective APIs instead of throwing).
3. Replace `delivery-worker`'s `/preview-placeholder` with a real
   variant-serving route backed by the storage providers.
4. Do **not** re-litigate the Phase 2 decisions above without reading them
   first — several (provider selection strategy, storage-key format,
   preset-scoping-per-project) are load-bearing for what Phase 3 builds on
   top.

## Phase 3 decisions and limitations

Read this section before touching the upload/processing/delivery path — a
few choices here revisit Phase 2 assumptions on purpose (documented why),
and several others are deliberate simplifications for this phase.

### The biggest revision to a Phase 2 assumption: local storage is R2, not the filesystem

Phase 2's `LocalStorageProvider` is real but Node-only (`node:fs`), and
context.md said outright: "If a future phase needs the Worker to serve
local files, that requires a different mechanism (e.g. a local R2
simulator), not this provider." Phase 3 is that future phase. workerd has
no real filesystem, even under `wrangler dev`, so none of the three
Workers can ever construct a `LocalStorageProvider`. Instead:

- All three Workers bind an R2 bucket (`ASSET_STORAGE`) and use
  `STORAGE_PROVIDER=r2` — `R2StorageProvider` (already real as of Phase 2,
  just never wired into a Worker) is the actual runtime storage layer now.
- Locally, this R2 bucket is entirely simulated by Miniflare — `wrangler
  dev`'s default (non-`--remote`) mode provisions it automatically, the
  same zero-credential mechanism that already backed local D1. No
  Cloudflare account is needed for any command in this phase.
- `packages/database/scripts/seed.ts` now constructs an `R2StorageProvider`
  from a Miniflare-provided `R2Bucket` instead of `LocalStorageProvider` —
  seeded fixture assets live in the same simulated bucket every Worker
  reads from, not a separate filesystem copy.
- `LocalStorageProvider` still exists, is still real, and is still used by
  its own package tests and by `@imageryx/providers/node`'s Node-only
  registry — it's just no longer part of the local *dev* storage path.

### Sharing local D1 + R2 + Queue state across three separate `wrangler dev` processes

Each Worker's `wrangler dev` is a genuinely separate OS process, launched
from its own app directory, and defaults to its own isolated
`.wrangler/state`. For api-worker's uploads to be visible to
delivery-worker's reads and processing-worker's queue consumer, all three
(and the seed script, and `pnpm processing:run-local`) now pass the same
`--persist-to ../../.wrangler-state` (Miniflare's `defaultPersistRoot:
<repo-root>/.wrangler-state/v3`), verified working end-to-end: an asset
uploaded through api-worker, queued to processing-worker, and read back
through delivery-worker in one manual session, with no shared-nothing gaps.
`pnpm db:migrate:local`/`db:status:local` pass the same flag. `db-reset-local.mjs`
and `storage-reset-local.mjs` were updated to target
`.wrangler-state/v3/{d1,r2}` instead of the old per-app paths.

**Real local Cloudflare Queue delivery across separate `wrangler dev`
processes actually works** with this shared `--persist-to` — confirmed by
manually uploading through api-worker and watching processing-worker pick
the job up and complete it (pending → ready) within ~3 seconds, with no
special configuration beyond the shared persist directory.
`PROCESSING_MODE=inline-local` (see below) is a documented fallback, not
the thing that was actually needed to make local dev work.

### `PROCESSING_MODE`: `queue` (default, real Queues) vs `inline-local`

`apps/api-worker/src/lib/dispatch-processing.ts` is the single place that
decides how a job gets run after being persisted:

- `queue` (default): `await env.PROCESSING_QUEUE.send({ jobId })` —
  awaited, not fire-and-forget, since a Queue `.send()` is a lightweight
  enqueue call, not "expensive processing"; this lets a publish failure be
  detected and reported in the same response (see "Upload consistency"
  below).
- `inline-local`: runs `runJobUntilSettled` — the *exact* function the
  real Queue consumer calls — inside `c.executionCtx.waitUntil(...)`, so
  the actual job work (metadata inspection, mock transform) never blocks
  the HTTP response, but no real Queue message is ever sent. Exists for
  environments where local multi-worker Queue delivery isn't available.

Both modes call into `@imageryx/processing-worker`'s exported `./jobs` and
`./jobs/deps` subpaths (see `apps/processing-worker/package.json`'s
`exports` field) — api-worker depends on the `processing-worker` app
package directly (a real, if slightly unusual, pnpm workspace pattern) so
there is exactly one implementation of "run a processing job," never a
second copy for the inline-local path. `buildProcessingDeps` takes an
explicit `ProcessingEnvBindings` interface, not the ambient `Env` global —
each Worker's own generated `Env` (from its own `worker-configuration.d.ts`)
is a separate ambient declaration only visible within that Worker's own
tsconfig program, so a bare `Env` parameter type would silently resolve to
the *caller's* ambient type instead of failing loudly across packages.

### Central auth, error handling, request IDs

- `apps/api-worker/src/middleware/auth.ts` protects every `/v1/*` route
  (mounted once in `index.ts`, never per-route) — Bearer token compared to
  `env.IMAGERYX_API_KEY` via `@imageryx/image-core`'s new
  `constantTimeEqual` (byte-by-byte XOR accumulator, no early return).
  `/health` and `/v1/info` are the only unauthenticated routes in api-worker
  (`/v1/info` is inside `/v1/*` and *is* now protected — see "Dashboard dev
  proxy" below for how the Overview page still reaches it).
- `apps/api-worker/src/middleware/error-handler.ts` is the single place
  every thrown error becomes the shared `ApiError` envelope:
  `ApiHttpError` subclasses (`lib/errors.ts`) carry their own
  status/code/message/details; `ZodError` becomes a 400 with field issues;
  every `ImageryxDomainError` subclass maps to a fixed status via a lookup
  table; anything unrecognized becomes a generic 500 with the real error
  only logged server-side. Never a stack trace, SQL fragment, absolute
  path, or provider error in the response body.
- Request IDs (`X-Request-Id`, generated or echoed) already existed from
  Phase 1 and are unchanged; `logActivity` (`lib/log-activity.ts`) adds a
  structured console line for project/folder/preset/tag-level events (see
  "Activity events" below for why those aren't in `asset_activity`).

### Upload flow and consistency guarantees

`apps/api-worker/src/services/upload-asset.service.ts` is a pure,
dependency-injected function (`uploadAsset(deps, input)`) — not tied to
Hono — called by both the real HTTP route and the backend integration
test directly. Order: validate project → validate folder (same project) →
enforce `MAX_UPLOAD_SIZE_MB` → `validateImageAsset` (claimed MIME +
extension + magic bytes, from `@imageryx/image-core`, unchanged from Phase
2) → `normalizeFilename` → checksum → duplicate-checksum lookup
(non-blocking, returned as `duplicateCandidates`) → free-path search
(numeric suffix loop, bounded at 1000 attempts) → generate the asset ID
*before* building its storage key → `storage.put` → `AssetPersistenceService.createAssetWithActivity`
(now accepts a pre-generated `id` and an `event`/`metadata` override — a
small, backward-compatible extension) → optional tag association →
`inspect-metadata` job created. The route layer then dispatches the job
(see `PROCESSING_MODE` above) and returns `201`.

Consistency, matching the phase's explicit requirements:

- **Storage succeeds, DB insert fails:** the service catches the DB error,
  attempts `storage.delete(key)`, logs a cleanup failure separately if
  *that* also fails, then rethrows the original error (translated by the
  central error handler, never masked by the cleanup attempt).
- **DB insert succeeds, Queue publish fails:** the asset and job rows are
  already committed; the response's `processingDispatch: { mode, dispatched }`
  field reports `dispatched: false` for a failed `queue` publish, but the
  asset is never deleted and the job stays `queued` — visible via
  `GET /v1/processing-jobs` and republishable via
  `POST /v1/processing-jobs/:jobId/retry`.

### Metadata inspection: format support and the mock-provider capability fix

`@imageryx/image-core`'s new `inspectImageDimensions` (pure, no decode
pipeline) parses real header bytes: PNG (IHDR — width/height/color type,
color type 4/6 ⇒ alpha), JPEG (scans markers for the first SOF0-family
segment — JFIF/EXIF headers vary in length, so no fixed offset works),
GIF (fixed-offset logical screen descriptor; per-frame transparency is not
scanned, reported as `null`, not `false`), WebP (VP8X's explicit alpha
flag, or VP8L's bit-packed 14-bit width/height/alpha field; plain lossy
VP8 has no alpha), SVG (`width`/`height` attributes, falling back to
`viewBox`). **AVIF dimension detection is unimplemented** — its
ISOBMFF/HEIF-derived container needs a real box parser this phase doesn't
include; it always reports `null`/`null` with a warning, exactly as the
phase spec allows. An unparseable/truncated header for any format never
invents a dimension — `null` fields plus a warning, asset still becomes
`ready`.

Placeholder generation is the phase's explicitly-allowed first
implementation, not real pixel analysis: `dominantColor` is the first 3
bytes of the asset's own SHA-256 checksum treated as an RGB triple
(`approximateDominantColorFromChecksum`), and `placeholder` is a tiny
solid-color SVG as a `data:` URI (`buildColorPlaceholderDataUri`) — both
deterministic, neither a real sample of the image's pixels.

**A real bug found during manual verification, now fixed:**
`MOCK_CAPABILITIES.supportsPersistentOutput` was `false` in Phase 2
(accurate then — the mock provider only returned a fabricated
`/preview-placeholder` URL, never wrote anything). Phase 3's
`generate-variant` handler *does* now persist real bytes when
`persist: true`, so the capability flag was stale and made
`selectTransformationProvider` reject every persistent variant request
with `unsupported_operation` — caught by testing the real upload → variant
flow against live local Workers, not by any unit test (the unit tests all
used synthetic capability fixtures that never touched the real constant).
Fixed in `packages/providers/src/transformations/mock-transformation.provider.ts`.

### Variant generation: real SVG bytes, never JSON pretending to be an image

`apps/processing-worker/src/jobs/handlers/generate-variant.ts` calls the
resolved `TransformationProvider.transform()` only to reuse its
deterministic width/height derivation and its `assetSlug.includes("fail")`
test hook (`MockTransformationFailureError`, classified non-retryable) —
every other field of the mock provider's fabricated result (mimeType,
sizeBytes, deliveryUrl, checksum) is discarded. Instead, the handler
renders a real SVG via `@imageryx/image-core`'s new
`renderSimulatedVariantSvg` (visibly encodes the asset name, preset name,
resolved dimensions, output format, and the literal text "Simulated
transformation"), computes a real checksum over those real bytes, and — if
`persist: true` (the default; threaded through `generate-variant`'s job
input, a small contract addition) — writes them through `StorageProvider`
at `buildDerivedStorageKey(...)`. `variant.deliveryUrl` is deliberately
left `null` in the DB — delivery paths are computed on demand from
project slug + asset path + preset slug (`@imageryx/image-core`'s
`buildDeliveryUrl`/`buildDeliveryPath`, the one implementation
`api-worker`, `@imageryx/sdk`, and `@imageryx/angular` all share), never
persisted, so a project slug rename can never leave a stale URL behind.

Only the Cloudflare/Cloudinary providers' `transform()` still always
throws `ProviderUnavailableError` (unchanged from Phase 2) — provider
selection only ever picks them when `externalProvidersEnabled: true`,
which nothing in this phase's default configuration sets, so this path is
reachable but inert without deliberately configured credentials.

### Idempotent variant generation

`apps/api-worker/src/services/generate-variant.service.ts`'s
`requestVariant` is the read-before-write fast path;
`idx_variants_unique_asset_preset_hash` remains the actual guarantee. On a
repeat request for the same asset+preset: `ready` → returns the existing
variant as-is (200); `pending`/`processing` → returns the existing variant
plus the still-active job ID (202, no new job); `failed` → returns the
existing variant and the associated (failed) job ID — retry goes through
`POST /v1/processing-jobs/:jobId/retry`, which is the one place a variant
legally moves `failed → pending` again (per
`VARIANT_STATUS_TRANSITIONS`), not a special case in the generation route.
An `Idempotency-Key` header is accepted but not separately tracked — the
`(assetId, presetHash)` uniqueness constraint already makes repeat
requests naturally idempotent without a separate key store.

### Delivery Worker route design

Chosen: `/:projectSlug/assets/:assetPath[/p/:presetSlug]` — the explicit
`/assets/` + `/p/` marker option the phase spec offered, over the
longest-match-first alternative. Implemented as a single Hono route
`/:projectSlug/assets/:rest{.+}` (regex-constrained catch-all param),
parsed by `apps/delivery-worker/src/lib/path.ts`: the preset marker is
recognized only when it's literally the **second-to-last** path segment
(`rest.split("/")`, checking `segments[length-2] === "p"`), not "the last
`/p/` anywhere in the string" — deliberately, so a real asset path
containing an unrelated `p` segment earlier on is never misparsed.

**Known, documented, narrow ambiguity:** an asset whose own logical path's
second-to-last segment is literally `p` (e.g. `docs/p/screenshot`) cannot
be requested as an original through this route — it will always be parsed
as `presetSlug: "screenshot"` of asset `docs`. No asset in this phase's
seed data or fixtures hits this; it's called out here and in SECURITY.md
rather than silently left for someone to discover.

### Visibility: binary, not three-tier

`@imageryx/contracts`' `assetVisibilitySchema` is `"public" | "private"` —
Phase 2's schema, unchanged. The phase spec's delivery section separately
describes "unlisted" behavior; since the domain model has no third value,
Phase 3 treats "private" as the complete answer for anything that isn't
plainly public: the normal path-based delivery route always returns a
generic 404 for both private and soft-deleted assets (`resolveDelivery`
never distinguishes "exists but private/deleted" from "never existed" in
its response), and the *only* way to fetch a private original or a
not-yet-public asset is a signed `/download/:token` link. 404 (not 410) is
used uniformly for deleted assets too, for the same non-disclosure reason.

### Signed downloads

`@imageryx/image-core`'s new `createSignedToken`/`verifySignedToken`
(HMAC-SHA256 over a base64url payload, `<payload>.<signature>` — never a
bare base64-encoded JSON blob) are shared verbatim by `api-worker` (issues)
and `delivery-worker` (verifies) via the same package, so the two can never
drift on token format. Payload: `{ assetId, variant: "original" | variantId,
exp, nonce }` — no secrets inside the token itself. Verification always
checks the HMAC signature (via `crypto.subtle.verify`, itself
constant-time) before trusting *any* payload field, including `exp`, and
distinguishes "malformed/bad signature" (400) from "validly-signed but
expired" (410) from "asset not found/deleted" or "downloads disabled for
this asset" (404) — `apps/delivery-worker/src/lib/signed-download.ts`
re-checks `asset.downloadOriginalEnabled` at delivery time, not only at
issuance, as defense in depth against the flag changing in between.

### Caching

Public originals: `public, max-age=3600, stale-while-revalidate=86400`,
ETag = `"<asset.checksum>"`, conditional `If-None-Match` → 304. Ready
variants: `public, max-age=31536000, immutable` (safe — variant identity
is keyed by preset hash, so a preset edit is a new hash, not a mutation of
existing bytes), ETag = `"<variant.checksum>"`, plus
`X-Imageryx-Simulated: true` whenever `variant.provider === "mock"`.
Signed downloads: `private, no-store`. Every delivery response also sets
`X-Content-Type-Options: nosniff`.

### Activity: asset-scoped events are real rows, project/folder/preset-scoped events are structured logs only

`asset_activity.asset_id` is `NOT NULL` (Phase 2's schema, unchanged) — a
project-created or preset-created event has no asset to attach to. Rather
than a risky SQLite table-rebuild migration under time pressure, Phase 3
keeps the schema as-is: every asset-scoped event in the phase spec's list
(uploaded, metadata inspected, ready, updated, moved, tags changed,
deleted, restored, variant requested/processing/ready, processing failed,
original/variant downloaded) is a real `AssetActivityRepository.record()`
row, queryable via `GET /v1/assets/:id/activity`. Project/folder/preset/tag
-scoped events (project created/updated, folder created, preset
created/updated, tag created/updated/deleted) go through
`apps/api-worker/src/lib/log-activity.ts` instead — a structured
`console.log`, not a database row. This is a real, documented scope
narrowing versus the phase spec's activity list, not an oversight.

### Stats and processing-job listing: bulk queries, but pagination is in-memory

`GET /v1/stats` is entirely aggregate `COUNT`/`SUM`/`GROUP BY` SQL — never
loads asset/job rows into the Worker. `GET /v1/processing-jobs`, by
contrast, calls `ProcessingJobRepository.list()` (no SQL-level
`LIMIT`/`OFFSET` — the repository method predates pagination) and slices
the array in the route handler. Fine for this phase's realistic local job
volumes; a documented, deliberate simplification, not a claim of
unbounded-scale correctness.

### Project cascade delete: `waitUntil` cleanup, not a `processing_jobs` row

`DELETE /v1/projects/:id?cascade=true` deletes the project row
synchronously (D1's real `ON DELETE CASCADE` handles every child table in
one fast statement) but cleans up the deleted assets' R2 objects inside
`c.executionCtx.waitUntil(...)`, never blocking the response. This is
**not** a `processing_jobs` row with a `delete-object` handler — Phase 3
doesn't implement one (see "Unimplemented job types" below) — so a
cascade-delete's storage cleanup has no retry/visibility if it fails
beyond a structured error log. The development dashboard never sends
`cascade=true`, per the phase spec.

### Unimplemented processing-job types

Only `inspect-metadata` and `generate-variant` have real handlers.
`extract-placeholder` (as a *standalone* job — placeholder generation is
folded into `inspect-metadata`, see above), `strip-metadata`,
`copy-provider-result`, `delete-object`, and `batch-operation` all throw a
classified, non-retryable `UnsupportedJobTypeError` if ever dispatched —
none of Phase 3's routes ever create a job of these types, so this is
reachable-but-inert, matching the mock-only-real-behavior spirit
elsewhere in this phase.

### SDK and Angular package notes

- `@imageryx/sdk` is plain Fetch, framework-independent, with `ImageryxApiError`
  / `ImageryxNetworkError` / `ImageryxValidationError`. Every dynamic path
  segment goes through `seg()` (`encodeURIComponent`) — verified by a test
  asserting a slash inside an ID doesn't silently become an extra path
  segment. `assets.upload()` builds real `FormData` (browser `File` or any
  `Blob`), never assumes Node's file APIs.
- `@imageryx/angular`'s `<imgyx-image>` uses signal `input()`/`output()`
  as required, but its outputs are named `imageLoad`/`imageError`, **not**
  `load`/`error`: `@angular-eslint/no-output-native` correctly flags a
  component output shadowing a native DOM event name as ambiguous on a
  host binding. It depends on `@imageryx/image-core` (for the shared
  delivery-URL builder) but deliberately not on `@imageryx/sdk` — the
  image component never needs an API key or JSON parsing, just URL
  strings, so it stays that much smaller and can never accidentally call
  an authenticated endpoint.
- Getting `@imageryx/angular`'s own component tests running under Vitest
  (via `@analogjs/vite-plugin-angular`, zoneless — no zone.js anywhere in
  this workspace) needed two non-obvious files the framework silently
  degrades without: a `tsconfig.spec.json` (its absence produced a
  logged-but-easy-to-miss "Unable to resolve tsconfig… causes compilation
  issues" warning, and *silently* compiled decorators as inert no-ops,
  producing the confusing runtime error `NG0303: ... input()` on a field
  that plainly used `input()`) and `tslib` as a real dependency (once
  decorator compilation actually ran). If a future package's Angular tests
  fail with `NG0303`/`NG0950` despite correct signal-input code, check for
  both files first.

### Dashboard production build: workspace-package barrel files need a manual esbuild fallback

Found only by actually running `pnpm build` (not caught by `pnpm dev`, `pnpm test`, or
`pnpm typecheck` — all of which passed throughout development): `apps/dashboard`'s production
build (`vite build`, via `@analogjs/platform`'s `analog()` plugin) failed with `"createImageryxClient"
is not exported by "../../packages/sdk/src/index.ts"` even though the export is plainly there.
Root cause, confirmed by instrumenting a debug Vite plugin to print each file's post-transform
content: `@analogjs/vite-plugin-angular`'s TypeScript/Angular compiler (`fileEmitter`) intercepts
*every* `.ts` file reachable in the module graph, including workspace packages resolved through
pnpm's symlinks — not just `apps/dashboard/src/**`. For pure re-export barrel files with no
Angular decorators (`@imageryx/sdk`'s and `@imageryx/angular`'s `src/index.ts` — both just
`export { ... } from "./x"` lines), its production-build emit path returns **empty content**
instead of the correctly-transpiled JS. Rollup then parses that empty string, sees zero
import/export statements, and silently never even requests the files `index.ts` was supposed to
import (`client.ts`, `imgyx-image.component.ts`, etc.) — the whole subgraph past the barrel
vanishes. `pnpm dev` never hits this (the dev-server code path handles unrecognized/out-of-program
files differently), which is why manual E2E testing of `/dev-flow` earlier in this phase never
caught it.

Fixed in `apps/dashboard/vite.config.ts`, without touching `node_modules`, using two of the
Angular plugin's own supported options together:

1. `analog({ vite: { transformFilter: (code, id) => !id.includes("/packages/") } })` — tells the
   Angular compiler to skip every file under the workspace's `packages/` directory entirely
   (return `undefined`, decline to handle it), rather than let it silently mis-emit them.
2. A small custom plugin (`enforce: "pre"`, so it runs before the Angular plugin's own hook)
   that runs those same `packages/**/*.ts` files through `transformWithEsbuild` (re-exported
   directly by the `vite` package — no extra dependency needed) — the same plain esbuild
   transform Vite would apply by default if the Angular plugin weren't claiming ownership of
   every `.ts` file's transform.

Verified via a from-scratch bisection (isolating `analog()` from `tailwindcss()`, confirming a
plain `vite build` with no Angular plugin at all succeeds, then confirming the fix restores a
full, successful build including the Nitro server bundle) — not just "it built once." This is a
**general, not sdk-specific** fix: it applies to any current or future workspace package the
dashboard imports whose entry file is a pure re-export barrel, not only `@imageryx/sdk`/`@imageryx/angular`.
Anyone adding a new workspace package dependency to `apps/dashboard` should run `pnpm --filter
@imageryx/dashboard build` (not just `pnpm dev`) before considering it done.

### Dashboard dev-only proxy and `/dev-flow`

`apps/dashboard/src/server/routes/api/[...path].ts` is an h3/Nitro server
route (Analog's dev-server middleware serves it under `/api/*` — confirmed
by `vite`'s own startup log, "The server endpoints are accessible under
the '/api' path") that forwards to `api-worker`, injecting
`Authorization: Bearer ${process.env.IMAGERYX_API_KEY || "imgx_dev_local"}`
server-side. This is the chosen "local development proxy" strategy from
the phase spec's three options. The browser never holds the key: `IMAGERYX_CLIENT`
(`apps/dashboard/src/app/core/sdk/imageryx-client.token.ts`) configures
the SDK with `baseUrl: "/api"` and no `apiKey`. `HealthService.loadInfo()`
was moved from calling `env.apiUrl` directly to the same relative
`/api/v1/info` path, since `/v1/info` is inside `/v1/*` and is now
auth-protected — verified manually: `curl localhost:5173/api/v1/info` with
*no* Authorization header returns a real 200 from api-worker. `/health` on
each Worker is unchanged (outside `/v1/*`, never required auth, still
called directly). This proxy is confirmed working under `pnpm dev`
(Vite's dev middleware); it is **not** verified to run in this dashboard's
current production deployment (`ssr: false`, `wrangler pages deploy
dist/client` — a static-only SPA build), since `/dev-flow` and this proxy
are explicitly dev-only per the phase spec.

`/dev-flow` (`apps/dashboard/src/app/pages/dev-flow.page.ts`) drives the
real pipeline through the real SDK: project/folder selection, file
upload, polled processing status, preset selection, polled variant
generation, original/preset delivery URLs, a live `<imgyx-image>` render
(dogfooding the real Angular component against real delivery URLs), and
generated HTML/Angular snippets. No hardcoded success states — every
section reflects real SDK responses or a real `ImageryxApiError`.

### Backend integration test: real D1 + R2, direct function calls, not a multi-worker network topology

`apps/api-worker/test/integration/upload-to-delivery.spec.ts` runs under
plain Node (`vitest.integration.config.ts`, **not**
`@cloudflare/vitest-pool-workers`) against a real Miniflare-backed D1
(`@imageryx/database/testing`'s existing ephemeral harness) and a second,
independent ephemeral Miniflare R2 bucket. It calls the same production
functions the three Workers' HTTP/Queue entry points call —
`uploadAsset`, `runJobUntilSettled` (`@imageryx/processing-worker/jobs`),
`requestVariant`, `resolveDelivery` and `resolveSignedDownload`
(exported from new `@imageryx/delivery-worker` subpaths:
`./resolve-delivery`, `./signed-download`) — directly, rather than
spinning up three real network servers or configuring
`@cloudflare/vitest-pool-workers`' multi-worker service-binding auxiliary
workers. This was a deliberate scope decision: the auxiliary-worker
topology adds real config complexity for equivalent coverage of the
actual business logic, which is what this test exists to exercise. **Must
never live inside `apps/api-worker/test/**` matched by the default
`vitest.config.ts`** — that pool is workerd-based and cannot run
Node-only code (Miniflare itself); `vitest.config.ts` now explicitly
excludes `test/integration/**`. (This exact mismatch caused a `workerd`
segfault-on-exit with an exit code of 1 despite every individual test
passing, found during verification — a reminder that a passing test count
doesn't guarantee a passing process exit code.)

### `pnpm processing:run-local`

`tooling/scripts/processing-run-local.ts` (a real `.ts` script now, not
just `.mjs` — `tooling/scripts` gained a `tsconfig.json` and a
`typecheck` script) connects to the same shared `--persist-to` D1 + R2
state as `wrangler dev`/the seed script, finds every `queued`
`processing_jobs` row across all projects, and runs each through
`processJob` (`@imageryx/processing-worker/jobs`) — the same function
everything else in this phase uses. Useful for draining jobs without a
live Queue consumer running. Verified against live local state (reports
"No queued processing jobs found" correctly when nothing is pending).

### Exact starting point for Phase 4

Phase 3 delivers a functional backend and delivery flow, verified against
real running Workers (not just isolated unit tests): upload → real D1 row
→ real Queue message → real processing-worker consumer → metadata
inspection with real dimension/alpha parsing → asset ready → variant
request → real Queue message → mock transformation → real SVG bytes
persisted to R2 → delivery-worker resolution → correct headers and body,
plus signed downloads, all confirmed live via `curl` against three
concurrently-running `wrangler dev` processes and the dashboard's own dev
server. Phase 4 ("Complete Dashboard") should:

1. Build the real `/library`, `/projects`, `/presets`, `/processing`,
   `/api`, `/settings` pages on `@imageryx/sdk` (already a complete,
   tested client — no new backend surface should be needed for basic
   CRUD/browsing) and `@imageryx/angular` (already renders real assets).
2. Revisit the project/folder/preset activity gap (see "Activity" above)
   if Phase 4's UI wants a real project-level activity feed — that needs
   an actual schema change (a new table, or a nullable `asset_id`), not
   just a route.
3. Decide whether `ProcessingJobRepository.list()` needs real SQL
   pagination before a dashboard job-monitoring view ships (see "Stats and
   processing-job listing" above).
4. Do **not** re-litigate the Phase 3 decisions above without reading them
   first — the R2-backed local storage architecture, the shared
   `--persist-to` state, the binary visibility model, and the Delivery
   Worker route design are all load-bearing for what Phase 4 builds on top.

## Technology decisions

- **Package manager / build:** pnpm workspaces + Turborepo. Node 22+.
- **Backend runtime:** Cloudflare Workers, [Hono](https://hono.dev) for
  routing/middleware.
- **Frontend:** [Analog](https://analogjs.org) + Angular 21 — standalone
  components, signals, **zoneless** change detection
  (`provideZonelessChangeDetection()`, no `zone.js` in the runtime
  bundle), `ChangeDetectionStrategy.OnPush` everywhere, Tailwind CSS 4
  (CSS-first config, no `tailwind.config.js`).
- **Testing:** Vitest everywhere. Workers use
  `@cloudflare/vitest-pool-workers` (tests run inside `workerd`, not a
  Node mock). The dashboard's Phase 1 tests are plain Vitest against
  framework-free pure functions (env parsing, health-status mapping) —
  there is no Angular TestBed/jsdom harness yet, since nothing in Phase 1
  needs component-level rendering tests.

## UI responsibility boundaries

Four external UI libraries are used, each with a distinct job. Don't blur
these — e.g. don't reach for a Lumen SVG path by hand when an icon
component already exists, don't hand-roll a tooltip when Quartz Headless
exists to be imported for other things later:

- **Volt UI** (`@voltui/components`) — the visual component layer
  (buttons, badges, avatar, separator, sidebar layout, theming). Owns
  what things _look like_.
- **Quartz Headless** (`quartz-headless`) — unstyled behavioral
  primitives. Phase 1 uses `ViewportService` only (collapsing the sidebar
  at tablet widths). Its overlay/dialog/toast/tree/drag-drop primitives
  are unused until a later phase needs them — don't wire them up
  speculatively.
- **Angular Movement** (`angular-movement`) — animation directives.
  Phase 1 uses `moveEnter="fade"` on the app shell only, via
  `provideMovement()`. It already handles `prefers-reduced-motion`
  internally.
- **Lumen Icons** (`lumen-icons`) — every icon in the shell, as standalone
  components (`<lmn-search />`, not inline SVG or an icon font).

## Application responsibilities

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown. One-line
version: `dashboard` is the control plane, `api-worker` is the only public
write path, `delivery-worker` is the read path, `processing-worker` does
the CPU-heavy work off the request path. None of the three Workers import
a vendor storage/transformation SDK directly — `@imageryx/providers` owns
that boundary, and has real implementations as of Phase 2 (`R2StorageProvider`,
`CloudflareImagesProvider`, `CloudinaryProvider`) — but none of them make a
real network call yet; only `api-worker`'s `/v1/diagnostics/*` routes and
the local seed script actually exercise a provider today.

## Deferred work (do not implement yet)

Tracked in each placeholder package's own README, but summarized here:

- `database` — schema, migrations, and repositories exist (Phase 2); no
  production API routes consume them yet (that's Phase 3's upload/asset
  CRUD routes).
- `image-core` — domain validation/normalization/hashing/provider-selection
  logic exists (Phase 2); still no decode/resize/crop/encode pixel
  pipeline — real transformation happens inside a provider's
  `transform()`, not in this package.
- `providers` — real `LocalStorageProvider`, structurally-ready
  `R2StorageProvider`, deterministic `MockTransformationProvider`, and
  parameter-mapping-only `CloudflareImagesProvider`/`CloudinaryProvider`
  exist (Phase 2); none of the three transformation providers other than
  mock make a real network call yet, and no app wires the storage
  providers into a real upload/delivery path yet.
- `sdk` — no HTTP client.
- `angular` — no `@angular/core` dependency, no directives/pipes yet.
- Dashboard routes other than Overview — no functional controls, just a
  static "Upcoming — Phase 4" notice.
- `api-worker` — only diagnostic `GET` routes were added in Phase 2; still
  no upload routes, no auth beyond the Phase 1 placeholder, no write paths
  other than the local seed script.
- CI (`.github/workflows/ci.yml`) now deploys all five apps to Cloudflare
  on every push to `main`, gated behind the lint/typecheck/test/build
  job — see "Deployment" below. There is still no auth on any business
  route, so this exposes diagnostic-only endpoints and a static dashboard,
  not a production-ready write path.

### Deployment

- `dashboard` and `web` deploy to Cloudflare Pages (`imageryx-dashboard`,
  `imageryx-web` projects) via `wrangler pages deploy dist/client`.
- `api-worker`, `delivery-worker`, `processing-worker` deploy to Cloudflare
  Workers via `wrangler deploy --env production`, each with its own
  `env.production` block in `wrangler.jsonc` (production `vars`, and for
  `api-worker`, the real `imageryx-db` D1 binding).
- `api-worker`'s CI job runs `db:migrate:production`
  (`wrangler d1 migrations apply imageryx-db --remote --env production`)
  before deploying.
- All five apps deploy as independent, parallel GitHub Actions jobs (each
  `needs: check`), authenticating with the repo's `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` secrets. Every app also has a `pnpm --filter
  <name> run deploy` script for deploying manually from a local machine
  authenticated with `wrangler login`.

## Package compatibility notes

- **Angular version is pinned to `^21.2.0`, not the latest 22.x line.**
  All four external UI libraries (`@voltui/components`, `quartz-headless`,
  `angular-movement`, `lumen-icons`) declare `peerDependencies` capped at
  `^21.x` at the time this phase was built. Bumping the dashboard to
  Angular 22 will produce peer-dependency warnings (or breakage) until
  those libraries publish 22.x-compatible releases — check their
  `peerDependencies` before upgrading.
- **`@voltui/components` is dual-distributed.** Its own repo describes it
  as "copy-and-own" (a `@voltui/cli add <component>` command that copies
  component source into your app, shadcn-style) — but the version
  published to npm _also_ ships a normal `"."` package export (built via
  ng-packagr: `fesm2022` bundle + `.d.ts`). This repo uses the plain
  `import { VoltButton, provideVoltTheme } from '@voltui/components'`
  path, not the CLI, since a normal import is simpler for a monorepo and
  fully supported by the published package — confirmed by inspecting the
  installed package's `package.json` `exports` field and `.d.ts`, not by
  assumption.
- **Theming.** Volt UI ships per `data-color`/`data-style` combination as
  separate CSS files (`@voltui/components/themes/presets/<color>-<style>.css`).
  This repo imports exactly one (`glacier-sharp`) in
  `apps/dashboard/src/styles.css`. Switching the palette means changing
  that one `@import`, not writing new CSS. Dark/light mode toggling
  (`applyVoltTheme({ dark })`) works within whichever preset is imported,
  since each preset defines both a `:root` and a `.dark` block.
- **Tailwind content scanning.** No manual `content: [...]` globs exist
  (Tailwind v4 + `@tailwindcss/vite` auto-detects the Vite module graph).
  Volt's own theme CSS additionally self-registers its compiled bundle via
  `@source '../fesm2022'` so its utility classes aren't purged — this is
  inside the imported preset file, not something this repo configures.
- **Lumen Icons** ship as one standalone Angular component per icon
  (`LmnSearchIcon`, selector `lmn-search`, etc.) with `size`/`tone`/
  `variant`/`animate` inputs — import only the specific icons used, not a
  barrel of everything, to keep the bundle lean.
