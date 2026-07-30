# Changelog

All notable changes to this project are documented in this file. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Phase 2: Domain, Persistence and Provider Foundations

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
