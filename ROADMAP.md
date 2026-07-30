# Roadmap

This roadmap tracks phases, not dates. Each phase is only started once the
previous one is complete and its definition of done is met.

## Phase 1 — Repository Foundation ✅ (current)

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

## Phase 2 — Storage & Uploads

- `@imageryx/database` gets a real D1 schema and repositories (assets,
  projects).
- `api-worker` gains upload routes backed by a local storage provider,
  then an R2 provider.
- `@imageryx/providers` gains real `StorageProvider` implementations
  behind the identifiers introduced in Phase 1.

## Phase 3 — Transformation Pipeline

- `@imageryx/image-core` implements the provider-independent
  decode/resize/crop/encode pipeline.
- `processing-worker`'s Queue consumer runs real transformation jobs
  instead of acknowledging placeholders.
- `delivery-worker` serves real transformed assets, cache-first, replacing
  `/preview-placeholder`.
- A first real `TransformationProvider` (in-house, then Cloudinary as an
  alternate) lands in `@imageryx/providers`.

## Phase 4 — Complete Dashboard

- `/library`, `/projects`, `/presets`, `/processing`, `/api`, and
  `/settings` become functional, backed by `@imageryx/sdk` and
  `@imageryx/angular`.
- Project switcher, global search, and upload button (currently disabled
  placeholders) become real.
- API key management UI, wired to real auth on `api-worker`.

## Phase 5 — Production Hardening & Release

- Authentication/authorization on business routes.
- Deployment configuration (currently intentionally absent) and CI/CD.
- First tagged release; package publishing workflows for `@imageryx/sdk`
  and `@imageryx/angular`.

## Out of scope for now

Multi-region storage replication, video/animated-format transformation,
and a hosted managed offering are not planned in the phases above and will
only be scoped once Phase 5 ships.
