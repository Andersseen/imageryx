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

Explicitly **not** in this phase: real upload routes (multipart or
otherwise), real R2/Cloudflare Images/Cloudinary network calls, public
delivery routes, real Queue-driven processing, the SDK, the Angular image
component, or any dashboard route beyond Phase 1's Overview page. Do not
start Phase 3 work without re-reading ROADMAP.md first.

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
