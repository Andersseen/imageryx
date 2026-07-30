# Contributing to Imageryx

Thanks for your interest in contributing. Imageryx is early — Phase 1 is
repository foundation only (see [ROADMAP.md](ROADMAP.md)) — so please open
an issue before starting substantial work, to avoid duplicated effort.

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
pnpm dev
```

See the [README](README.md#local-urls) for local URLs.

## Before opening a PR

Run the full check suite locally — it's exactly what CI runs:

```bash
pnpm check
```

This runs lint, typecheck, tests, and a build across every app and package
via Turborepo, respecting the workspace's task dependency graph.

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

## Reporting bugs / requesting features

Use the issue templates (`.github/ISSUE_TEMPLATE/`). For security issues,
see [SECURITY.md](SECURITY.md) instead of opening a public issue.
