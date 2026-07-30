# Imageryx

Imageryx is an open, provider-independent image delivery and
transformation platform: upload once, transform on request, and serve from
the edge — without locking storage or transformation logic to a single
vendor.

## Status: Phase 1 — Repository Foundation

This repository is currently at **Phase 1**: the monorepo structure, local
dev experience, and open-source scaffolding. There is **no image
processing, no real uploads, no R2/Cloudinary integration, no database
repositories, and no complete dashboard yet** — every app starts, builds,
and reports real health, and that's the whole scope of this phase. See
[ROADMAP.md](ROADMAP.md) for what's next and [context.md](context.md) for
the full working context.

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
  api-worker/          Public API entry point (Hono)          → :8787
  delivery-worker/     Asset delivery edge (Hono)              → :8788
  processing-worker/   Queue consumer for transformation jobs  → :8789

packages/
  contracts/           Shared TypeScript contracts (HealthCheckResponse)
  database/            D1 schema/repositories — placeholder until Phase 2
  image-core/          Transformation pipeline — placeholder until Phase 3
  providers/           Storage/transformation provider identifiers
  sdk/                 Framework-agnostic API client — placeholder until Phase 4
  angular/             Angular SDK bindings — placeholder until Phase 4
  test-utils/          Shared testing helpers
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
pnpm dev        # start dashboard + all three Workers concurrently
pnpm build      # production build of every app/package
pnpm lint       # ESLint across the workspace
pnpm typecheck  # TypeScript project-reference typecheck across the workspace
pnpm test       # Vitest across every app/package that has tests
pnpm check      # lint + typecheck + test + build, in dependency order
```

Target a single app/package while iterating:

```bash
pnpm --filter @imageryx/api-worker dev
pnpm --filter @imageryx/dashboard test
```

## Local URLs

| App | URL |
| --- | --- |
| Dashboard | http://localhost:5173 |
| API Worker | http://localhost:8787 |
| Delivery Worker | http://localhost:8788 |
| Processing Worker (HTTP dev endpoint) | http://localhost:8789 |

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
```

Never commit a working `.env` file or real secrets — `.env*` (except
`*.example`) is git-ignored.

## Current limitations

- No uploads, storage, or transformation logic (`STORAGE_PROVIDER=local`
  and `TRANSFORMATION_PROVIDER=mock` are placeholders, not working
  integrations).
- No database — `@imageryx/database` is metadata-only.
- Dashboard routes other than **Overview** are static "Upcoming — Phase 4"
  placeholders with no interactive controls.
- No deployment configuration for any app; CI only lints/typechecks/tests/builds.
- No authentication on any route.

## Roadmap summary

Phase 1 (this repo) → Phase 2 storage & uploads → Phase 3 transformation
pipeline → Phase 4 complete dashboard → Phase 5 production hardening &
release. Full detail in [ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please also read
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and, for vulnerabilities,
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE)
