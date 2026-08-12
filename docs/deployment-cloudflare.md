# Deploying Imageryx to Cloudflare

This is the real, current deployment path for a personal Cloudflare
account — it documents exactly what the repository's own scripts and
`wrangler.jsonc` files do, not an aspirational process. See README.md's
"Deployment" section for the shorter summary this guide expands on, and
ARCHITECTURE.md's "Future hosted (managed) model" for what this
deliberately does _not_ cover (multi-tenant/managed hosting).

## 1. Prerequisites

- A Cloudflare account (Workers + Pages + D1 + R2 + Queues — all available
  on the free tier for personal use; see step 19 for limits).
- `wrangler login` run once from the machine you'll deploy from (or a
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` pair for CI — see step 9).
- Everything from the main README's "Requirements" (Node 22+, pnpm 9+).

## 2. Cloudflare account requirements

No special plan is required. Queues and D1 are generally-available
Workers features; R2 needs to be enabled once per account (Cloudflare
prompts for this the first time you use it, including via `wrangler`).

## 3. Wrangler authentication

```bash
pnpm exec wrangler login
```

Opens a browser to authorize the CLI against your account. Confirm with
`pnpm exec wrangler whoami`.

## 4–7. Resource creation (D1, R2, Queue) — check before creating

**This repository's `wrangler.jsonc` files already reference real resource
names and a real D1 database ID** (`imageryx-db`, `imageryx-storage`,
`imageryx-processing-queue` — see `apps/api-worker/wrangler.jsonc`), which
means these were already created at some point against _some_ Cloudflare
account. Before creating anything new, confirm what already exists in
**your** account:

```bash
pnpm exec wrangler d1 list
pnpm exec wrangler r2 bucket list
pnpm exec wrangler queues list
```

If `imageryx-db` / `imageryx-storage` / `imageryx-processing-queue` are not
in your account (e.g. you're deploying to a different account than
whoever last touched this repo), create them and update the `database_id`
in all three Workers' `wrangler.jsonc` (`api-worker`, `delivery-worker`,
`processing-worker` — all three must reference the _same_ D1 database and
R2 bucket):

```bash
pnpm exec wrangler d1 create imageryx-db
pnpm exec wrangler r2 bucket create imageryx-storage
pnpm exec wrangler queues create imageryx-processing-queue
```

`wrangler d1 create` prints a `database_id` — paste it into the
`database_id` field of all three `wrangler.jsonc`'s `env.production`
blocks (and the top-level block, used by `wrangler dev`).

## 8. Binding IDs

Already wired in each Worker's `wrangler.jsonc` (`env.production`):
`DB` (D1), `ASSET_STORAGE` (R2), `PROCESSING_QUEUE` (Queue, api-worker
producer / processing-worker consumer). Nothing to configure here beyond
step 4–7's `database_id` if you created a new database.

## 9. Environment variables and secrets

| Name                                           | Kind                 | Where                                                            |
| ---------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| `APP_ENV`                                      | plain var            | `wrangler.jsonc`                                                 |
| `STORAGE_PROVIDER`                             | plain var            | `wrangler.jsonc`                                                 |
| `TRANSFORMATION_PROVIDER`                      | plain var            | `wrangler.jsonc`                                                 |
| `DASHBOARD_URL`/`DELIVERY_URL`                 | plain var            | `wrangler.jsonc`                                                 |
| `MAX_UPLOAD_SIZE_MB`                           | plain var            | `wrangler.jsonc`                                                 |
| `ASSET_RECOVERY_DAYS`                          | plain var            | `wrangler.jsonc`                                                 |
| `PROCESSING_MAX_ATTEMPTS`                      | plain var            | `wrangler.jsonc`                                                 |
| `PROCESSING_MODE`                              | plain var            | `wrangler.jsonc`                                                 |
| `IMAGERYX_API_KEY`                             | **secret**           | `wrangler secret put` (api-worker only; bootstrap fallback)      |
| `IMAGERYX_INTERNAL_API_KEY`                    | **secret**           | dashboard server environment                                     |
| `DEV_AUTH_*` / `SESSION_SECRET`                | **secret/plain mix** | dashboard server environment; see `docs/dev-auth-integration.md` |
| `DOWNLOAD_SIGNING_SECRET`                      | **secret**           | `wrangler secret put` (api-worker + delivery-worker)             |
| `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` | CI secret            | GitHub Actions repo secrets (deploy workflows only)              |
| `CLOUDINARY_*`                                 | **secret**           | processing-worker production environment                         |

For CI deploys, `CLOUDFLARE_ACCOUNT_ID` must be the exact account that owns
`imageryx-dashboard`, `imageryx-web`, `imageryx-db`,
`imageryx-storage`, `imageryx-processing-queue`, and the three Workers.
The `CLOUDFLARE_API_TOKEN` secret must have edit access for Cloudflare Pages,
Workers Scripts, D1, R2, and Queues on that account. Also grant User Details
read access so Wrangler can identify the token cleanly in CI logs.

## 10. Secrets

**Required before the first real deploy** — `api-worker` and
`delivery-worker` now refuse to serve any request in production if either
secret still equals its committed local-dev default (see SECURITY.md):

```bash
pnpm key:generate   # run twice, once per secret below — never reuse one value for both

pnpm --filter @imageryx/api-worker exec wrangler secret put IMAGERYX_API_KEY --env production
pnpm --filter @imageryx/api-worker exec wrangler secret put DOWNLOAD_SIGNING_SECRET --env production
pnpm --filter @imageryx/delivery-worker exec wrangler secret put DOWNLOAD_SIGNING_SECRET --env production
pnpm --filter @imageryx/processing-worker exec wrangler secret put CLOUDINARY_CLOUD_NAME --env production
pnpm --filter @imageryx/processing-worker exec wrangler secret put CLOUDINARY_API_KEY --env production
pnpm --filter @imageryx/processing-worker exec wrangler secret put CLOUDINARY_API_SECRET --env production
```

`DOWNLOAD_SIGNING_SECRET` **must be identical** between `api-worker` and
`delivery-worker` — one issues signed download tokens, the other verifies
them. Secrets set this way persist in Cloudflare across deploys; this is a
one-time step per environment, not a per-deploy one.

After bootstrapping, create a database-backed API key from the dashboard API
page or `POST /v1/api-keys`, configure that as `IMAGERYX_INTERNAL_API_KEY`
for the dashboard proxy, and keep `IMAGERYX_API_KEY` only until all old
scripts have migrated.

## 11. Database migrations

```bash
pnpm --filter @imageryx/api-worker run db:migrate:production
pnpm --filter @imageryx/api-worker run db:status:production   # confirm what's applied
```

Safe to re-run — migrations that already applied are skipped. Run this
before deploying `api-worker` if you're deploying code that depends on a
new migration (see `pnpm deploy`'s order below, which does this
automatically).

## 12. System seed

There is **no automated production seed script**, deliberately — unlike
local dev's fixture-heavy `pnpm setup:local`, production seeding is just
using the product: authenticate with your real `IMAGERYX_API_KEY` and call
`POST /v1/projects` with `withSystemPresets: true` (the dashboard's "New
project" dialog does this by default) to create your first project with
its 6 system presets already in place. No fixture assets are ever created
in production — those exist only for local development.

## 13. Worker deployment

```bash
pnpm --filter @imageryx/processing-worker run deploy
pnpm --filter @imageryx/api-worker run deploy
pnpm --filter @imageryx/delivery-worker run deploy
```

Order matters a little: `processing-worker` before `api-worker` means
api-worker never enqueues a job type a not-yet-updated consumer doesn't
handle. `pnpm deploy` (step 16) does this for you.

## 14. Dashboard deployment

```bash
pnpm --filter @imageryx/dashboard run build
pnpm --filter @imageryx/dashboard run deploy
```

Deploys to Cloudflare Pages today as a static SPA (`ssr: false`). The
dashboard auth and proxy routes are Nitro server routes under `/proxy`;
the personal release is not complete until the dashboard deployment target
is verified to run those routes in production or is moved to the intended
Cloudflare server runtime.

## 15. Custom domains

Not yet configured by this repository — every app deploys to its default
`*.pages.dev`/`*.workers.dev` URL (see README's "Deployment" table).
Adding e.g. `imageryx.yourdomain.dev` is a Cloudflare dashboard step
(Workers & Pages → your project → Custom Domains) outside `wrangler.jsonc`
— do this only once you've decided on real domain names, and remember to
update `DASHBOARD_URL`/`DELIVERY_URL` in `wrangler.jsonc` and CORS
expectations afterward.

## 16. Deploy scripts

```bash
pnpm deploy:validate   # dry-run every Worker's config + build the two Pages apps — no credentials needed
pnpm deploy             # the real thing: validate → migrate → processing → api → delivery → dashboard → web → smoke check
```

`pnpm deploy` stops at the first failing step (see
`tooling/scripts/deploy.mjs`) — it never proceeds past a failed migration
or a failed Worker deploy to touch the next one. It does not run any
destructive database command.

## 17. Smoke checks

```bash
pnpm smoke:production                              # public health checks only
IMAGERYX_API_KEY=<your real key> pnpm smoke:production  # + authenticated diagnostics
```

Non-destructive — checks `/health` on all three Workers plus the two Pages
URLs, and (only with the key set) the authenticated
`/v1/diagnostics/{database,providers,domain}` routes. Never uploads a test
image.

## 18. Rollback guidance

Cloudflare Workers/Pages don't have a single-command rollback in this
setup. Practically: `git revert` the change, then re-run `pnpm deploy` (or
the single-app `deploy-manual.yml` GitHub Action) for the affected app —
the previous version isn't kept "warm" anywhere, so redeploying the
previous commit _is_ the rollback. For a D1 migration you need to undo,
write a new migration that reverses it (see CONTRIBUTING.md — never edit
an already-applied one).

## 19. Free-tier considerations

Not hardcoded into application logic (see ARCHITECTURE.md's "Worker
performance review" note) — know these as operational limits, not code
constraints: Workers free tier is 100,000 requests/day; D1 free tier is
5GB storage and 5M rows read/day; R2 free tier is 10GB storage with no
egress fee; Queues free tier is 1M operations/month. A personal-use
deployment is unlikely to approach any of these; check
developers.cloudflare.com/workers/platform/pricing for current numbers if
you're unsure.

## 20. Cleanup

To tear down a deployment entirely:

```bash
pnpm exec wrangler delete --name imageryx-api-worker
pnpm exec wrangler delete --name imageryx-delivery-worker
pnpm exec wrangler delete --name imageryx-processing-worker
pnpm exec wrangler pages project delete imageryx-dashboard
pnpm exec wrangler pages project delete imageryx-web
pnpm exec wrangler d1 delete imageryx-db          # destructive — real data
pnpm exec wrangler r2 bucket delete imageryx-storage  # destructive — real objects
pnpm exec wrangler queues delete imageryx-processing-queue
```

The D1/R2 deletions are genuinely destructive and irreversible — confirm
you actually mean to delete production data before running them.
