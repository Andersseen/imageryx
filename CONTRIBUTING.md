# Contributing to Imageryx

Thanks for your interest in contributing. Imageryx is early — currently in
Phase 3 (functional backend and delivery flow, see
[ROADMAP.md](ROADMAP.md)) — so please open an issue before starting
substantial work, to avoid duplicated effort.

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
via Turborepo, respecting the workspace's task dependency graph. If your
change touches `api-worker`, `delivery-worker`, or `processing-worker`,
also run the Workers-pool suite and, if it touches the upload/processing/
delivery pipeline end to end, the backend integration test — neither is
part of `pnpm check` (see README's "Commands" for why):

```bash
pnpm test:workers
pnpm test:integration
```

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

## Reporting bugs / requesting features

Use the issue templates (`.github/ISSUE_TEMPLATE/`). For security issues,
see [SECURITY.md](SECURITY.md) instead of opening a public issue.
