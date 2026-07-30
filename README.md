# Imageryx

Imageryx is an open, provider-independent image delivery and
transformation platform: upload once, transform on request, and serve from
the edge — without locking storage or transformation logic to a single
vendor.

## Status: Phase 2 — Domain, Persistence and Provider Foundations

Phase 1 shipped the monorepo structure, local dev experience, and
open-source scaffolding. **Phase 2** (current) adds the provider-independent
image domain (`@imageryx/contracts` + `@imageryx/image-core`), a real D1
schema with tested repositories (`@imageryx/database`), and real local
storage / mock transformation / Cloudflare & Cloudinary mapping providers
(`@imageryx/providers`) — plus `/v1/diagnostics/*` routes on `api-worker`
to inspect all of it locally.

There is still **no upload API, no real R2/Cloudflare Images/Cloudinary
network calls, no delivery flow, no real Queue-driven processing, no SDK,
and no complete dashboard** — everything above is domain logic, storage,
and diagnostics, not yet wired into a public write path. See
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
  image-core/          Provider-independent domain logic (no pixel pipeline yet)
  providers/           Storage + transformation provider implementations (+ /node subpath)
  sdk/                 Framework-agnostic API client — placeholder until Phase 4
  angular/             Angular SDK bindings — placeholder until Phase 4
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
```

## Commands

Run from the repository root; Turborepo fans these out to every app/package
with the matching script, respecting dependency order:

```bash
pnpm dev        # start dashboard + web + all three Workers concurrently
pnpm build      # production build of every app/package
pnpm lint       # ESLint across the workspace
pnpm typecheck  # TypeScript project-reference typecheck across the workspace
pnpm test       # Vitest across every app/package that has tests
pnpm check      # lint + typecheck + test + build, in dependency order
```

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

## Local URLs

| App                                   | URL                   |
| ------------------------------------- | --------------------- |
| Dashboard                             | http://localhost:5173 |
| API Worker                            | http://localhost:8787 |
| Delivery Worker                       | http://localhost:8788 |
| Processing Worker (HTTP dev endpoint) | http://localhost:8789 |

## Local database & storage setup

`api-worker` owns the local D1 database binding
(`apps/api-worker/wrangler.jsonc`); `@imageryx/providers`' `LocalStorageProvider`
owns local file storage (`.local/storage`, git-ignored). One command sets
both up and seeds two projects' worth of data:

```bash
pnpm setup:local
```

That's `storage:prepare:local` → `db:migrate:local` → `db:seed:local` →
`db:status:local`, each independently re-runnable and idempotent. The
individual commands:

```bash
pnpm storage:prepare:local  # creates .local/storage
pnpm db:migrate:local        # wrangler d1 migrations apply (local)
pnpm db:seed:local           # seeds 2 projects, folders, tags, system presets, fixture SVG assets
pnpm db:status:local         # wrangler d1 migrations list (local)
```

Re-running `db:seed:local` is safe — it checks for existing rows before
inserting anything.

Two commands are **explicitly destructive** and never run as part of
`setup:local` or any other script:

```bash
pnpm db:reset:local       # wipes apps/api-worker/.wrangler/state/v3/d1
pnpm storage:reset:local  # wipes .local/storage
```

Seeded fixture assets are tiny, code-generated SVGs (not committed
binaries) clearly labeled as local development fixtures in both their
`name` field and their own SVG content.

## Diagnostic endpoints

`api-worker` exposes four read-only routes reporting real local state —
no secrets, complete API keys, absolute filesystem paths, internal
storage keys, or raw database errors in any response:

```http
GET /v1/diagnostics/domain      # supported formats/operations, dimension limits — no DB needed
GET /v1/diagnostics/database    # migrations applied, table row counts
GET /v1/diagnostics/providers   # configured providers + their capabilities
GET /v1/diagnostics/seed        # seed project/preset/asset counts
```

```bash
pnpm --filter @imageryx/api-worker dev   # in one terminal
curl http://localhost:8787/v1/diagnostics/database
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
STORAGE_PROVIDER=local
TRANSFORMATION_PROVIDER=mock
LOCAL_STORAGE_PATH=.local/storage
```

`ADVANCED_TRANSFORMATION_PROVIDER` and `CLOUDINARY_*` are documented
(commented out) in `.env.example` for the future `r2`/`cloudflare`/`cloudinary`
configuration — not active, and no command in this phase requires them.

Never commit a working `.env` file or real secrets — `.env*` (except
`*.example`) is git-ignored.

## Provider configuration

Storage and transformation backends are selected by env var, validated by
`@imageryx/providers`' Zod schema (`parseProviderConfig`) — an invalid or
incomplete combination (e.g. `STORAGE_PROVIDER=local` with no
`LOCAL_STORAGE_PATH`) fails fast rather than at first use:

| Var                                                                      | Local default    | Notes                                                                                            |
| ------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------ |
| `STORAGE_PROVIDER`                                                       | `local`          | `local` (filesystem, Node-only) or `r2` (binding-ready, no real request yet)                     |
| `TRANSFORMATION_PROVIDER`                                                | `mock`           | `mock` (real, deterministic), `cloudflare` or `cloudinary` (mapping-only — `transform()` throws) |
| `ADVANCED_TRANSFORMATION_PROVIDER`                                       | unset            | Optional secondary provider (e.g. Cloudinary alongside a Cloudflare primary)                     |
| `LOCAL_STORAGE_PATH`                                                     | `.local/storage` | Required when `STORAGE_PROVIDER=local`                                                           |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | unset            | Required only when Cloudinary is configured as either provider                                   |

## Current limitations

- No upload API, no delivery flow, no real Queue-driven processing — the
  domain, database, and provider layers exist and are tested, but nothing
  wires them into a public write path yet (Phase 3).
- No real network calls to Cloudflare Images, Cloudinary, or R2 —
  `CloudflareImagesProvider`/`CloudinaryProvider`'s `transform()` and
  `R2StorageProvider` compile against the real types but always throw or
  are simply unused; only `MockTransformationProvider` and
  `LocalStorageProvider` do real work.
- `@imageryx/image-core` has no decode/resize/crop/encode pixel pipeline —
  it validates, normalizes, hashes, and selects providers, but does not
  transform pixels itself.
- Dashboard routes other than **Overview** are static "Upcoming — Phase 4"
  placeholders with no interactive controls.
- No deployment configuration for any app; CI only lints/typechecks/tests/builds.
- No authentication on any route, including the new diagnostic routes —
  Phase 1 never implemented the `IMAGERYX_API_KEY` placeholder as a real
  middleware, so there is nothing yet to hook diagnostics auth into.

## Roadmap summary

Phase 1 repository foundation → **Phase 2 domain, persistence & provider
foundations (this repo)** → Phase 3 uploads, transformation pipeline &
delivery → Phase 4 complete dashboard → Phase 5 production hardening &
release. Full detail in [ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please also read
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and, for vulnerabilities,
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE)
