# Contributing to Imageryx

Thanks for your interest in contributing. Imageryx is early — currently in
Phase 5 (production hardening: security, tests, CI, accessibility,
documentation, Cloudflare deployment prep — see [ROADMAP.md](ROADMAP.md))
— so please open an issue before starting substantial work, to avoid
duplicated effort.

## Requirements

- Node.js 22+ (see `.nvmrc`)
- pnpm 9+ (`corepack enable` is the easiest way to get the right version)

## Setup

```bash
git clone <your-fork-url>
cd imageryx
pnpm install
cp .env.example .env
cp apps/dashboard/.env.example apps/dashboard/.env.local
pnpm setup:local   # local D1 migrations + seed data, shared with `wrangler dev`
pnpm dev
```

See the [README](README.md#local-urls) for local URLs and
[README](README.md#local-database--storage-setup) for what `setup:local`
does.

## Before opening a PR

Run the full check suite locally — it's exactly what CI runs:

```bash
pnpm check
```

This runs lint, typecheck, tests, and a build across every app and package
via Turborepo, respecting the workspace's task dependency graph. Two suites
are **not** part of `pnpm check` (see README's "Commands" for why) and need
running explicitly when relevant:

```bash
pnpm test:workers      # touching api-worker, delivery-worker or processing-worker
pnpm test:integration  # touching the upload -> processing -> delivery pipeline
pnpm test:e2e          # touching apps/dashboard (needs `pnpm e2e:install` once)
pnpm test:a11y         # touching apps/dashboard templates/styles (same install)
pnpm test:coverage     # touching a lot of one package — check you didn't drop its threshold
```

Please run `pnpm test:e2e` for any dashboard change, and **especially** any
change that adds a new route. This project has repeatedly shipped dashboard
code that lints, typechecks, builds and passes unit tests while being
broken in a browser: an SDK call that threw before reaching the network, a
toast component that rendered nothing, and — most recently — a same-named
list-page-file + detail-folder pair that Analog's file router silently
nests as an unrenderable child route, invisible to every unit test because
`provideRouter([...])` in a test bypasses real file-based route generation
entirely. See context.md's "Phase 4B decisions and limitations" before
adding a `<name>.page.ts` next to a `<name>/` folder — the correct shape is
`<name>/index.page.ts` alongside its dynamic siblings.
`pnpm --filter @imageryx/dashboard test:e2e:ui` opens Playwright's UI mode
for iterating on one spec.

You can also target a single app/package while iterating:

```bash
pnpm --filter @imageryx/api-worker test
pnpm --filter @imageryx/dashboard lint
```

## Commit and PR conventions

- Keep commits focused; write commit messages that explain _why_, not just
  _what_.
- Reference the related issue in your PR description.
- Fill out the PR template's test plan honestly — "ran `pnpm check`" is a
  valid and expected answer for most changes.
- Don't add functionality beyond the current phase's scope (see
  ROADMAP.md) unless you've discussed it in an issue first.

## Code style

- TypeScript strict mode; no `any`, no unchecked type assertions.
- Shared ESLint/TypeScript configs live in `packages/eslint-config` and
  `packages/typescript-config` — don't duplicate rules in individual apps.
- Angular: standalone components, signals, zoneless change detection,
  `ChangeDetectionStrategy.OnPush`. No `NgModule`s.
- No raw hex/rgb colors in components — use the design tokens exposed by
  Volt UI's theme (`bg-background`, `text-muted-foreground`, etc.).

## Backend conventions (api-worker / delivery-worker / processing-worker)

- Never call a `StorageProvider` or `TransformationProvider` from inside
  an `api-worker` route handler beyond a simple upload write — expensive
  or slow work goes through a `processing_jobs` row and a Queue message.
- Cloudflare Queue messages carry `{ jobId }` only — never a full payload
  or a secret. Handlers re-read what they need from D1/storage by ID.
- Never fabricate a successful result for the Cloudflare Images or
  Cloudinary providers — their `transform()` must keep throwing until a
  real network call is actually implemented.
- Every thrown error should be a typed `ApiHttpError`/`ImageryxDomainError`
  subclass so the central error handler can map it correctly — don't
  `c.json()` an ad hoc error shape from inside a route.
- No API key, signing secret, or other credential in code reachable from
  the browser (dashboard client code, `@imageryx/sdk`, `@imageryx/angular`).

## Extending the domain

- **Adding a contract**: `packages/contracts/src/<domain>/` — a Zod schema
  plus its inferred type, organized by domain (see the existing
  `projects/`, `assets/`, `presets/` directories). `contracts` never
  imports another workspace package; keep it that way.
- **Adding a migration**: a new numbered file in
  `packages/database/migrations/` — never edit an already-applied one (see
  the comment block at the top of `0001_initial_schema.sql`). Run
  `pnpm db:migrate:local` and add/extend the relevant repository's tests
  against the real migrated schema (`packages/database`'s own tests use
  `createTestDatabase()`, a real Miniflare-backed D1, not a mock).
- **Adding an image operation**: extend
  `packages/contracts/src/presets/image-operation.schema.ts`, then wire it
  through `packages/image-core`'s preset validation/hashing and both
  provider mapping adapters (`packages/providers/src/transformations/`) —
  explicitly reject it (an `UnsupportedOperationError`, not a silent
  no-op) in whichever adapter genuinely can't support it, matching the
  existing crop/grayscale pattern.
- **Adding a provider**: implement `StorageProvider` or
  `TransformationProvider` (`packages/providers/src/storage/` or
  `.../transformations/`), register it in
  `packages/providers/src/registry/provider-registry.ts` and
  `config/provider-config.schema.ts`, and — critically — never fabricate a
  successful result before the real integration exists; throw
  `ProviderUnavailableError` until it's real (see the backend-conventions
  rule above).

## Releasing (Changesets)

`@imageryx/sdk` and `@imageryx/angular` are tracked by
[Changesets](https://github.com/changesets/changesets) for version
planning; every other workspace package is deliberately excluded (see
`.changeset/config.json`'s `ignore` list — apps are never published, other
packages are internal-only for now). If your PR changes either package's
public behavior:

```bash
pnpm changeset          # interactive — pick the package(s), bump type, and a summary
```

This adds a markdown file under `.changeset/` — commit it with your PR.
`pnpm changeset:version` (maintainer-run, not part of a normal PR) applies
pending changesets: bumps versions and writes `CHANGELOG.md` entries. Both
packages are still `private: true`, so this does not publish to npm.

## Reporting bugs / requesting features

Use the issue templates (`.github/ISSUE_TEMPLATE/`). For security issues,
see [SECURITY.md](SECURITY.md) instead of opening a public issue.
