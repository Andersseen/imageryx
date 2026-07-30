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

## Phase 2 — Domain, Persistence and Provider Foundations ✅ (current)

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

## Phase 3 — Uploads, Transformation Pipeline and Delivery

- `api-worker` gains real multipart upload routes backed by the storage
  providers introduced in Phase 2.
- `@imageryx/image-core` implements the provider-independent
  decode/resize/crop/encode pipeline (or delegates to a real transformation
  provider's API).
- `processing-worker`'s Queue consumer runs real transformation jobs
  instead of acknowledging placeholders, using `@imageryx/database`'s
  processing-job repository and the provider registry from Phase 2.
- `delivery-worker` serves real transformed assets, cache-first, replacing
  `/preview-placeholder`.
- The Cloudflare Images and Cloudinary adapters prepared in Phase 2 make
  their first real network calls.

## Phase 4 — Complete Dashboard

- `/library`, `/projects`, `/presets`, `/processing`, `/api`, and
  `/settings` become functional, backed by `@imageryx/sdk` and
  `@imageryx/angular`.
- Project switcher, global search, and upload button (currently disabled
  placeholders) become real.
- API key management UI, wired to real auth on `api-worker`.

## Phase 5 — Production Hardening & Release

- Authentication/authorization on business routes (CI/CD and basic
  Cloudflare deployment already exist as of Phase 2 — see context.md,
  "Deployment" — but nothing deployed is auth-protected yet).
- First tagged release; package publishing workflows for `@imageryx/sdk`
  and `@imageryx/angular`.

## Out of scope for now

Multi-region storage replication, video/animated-format transformation,
and a hosted managed offering are not planned in the phases above and will
only be scoped once Phase 5 ships.
