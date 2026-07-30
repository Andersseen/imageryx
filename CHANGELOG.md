# Changelog

All notable changes to this project are documented in this file. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Phase 1: Repository Foundation

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
