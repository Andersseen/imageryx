# @imageryx/api-worker

Public entry point of the Imageryx API. A [Hono](https://hono.dev) app
running on Cloudflare Workers.

## Phase 1 routes

| Route | Description |
| --- | --- |
| `GET /health` | Liveness check — service, status, environment, version, timestamp |
| `GET /v1/info` | Adds product name and the currently configured placeholder storage/transformation providers |

No upload, transformation, or asset routes exist yet — see [ROADMAP.md](../../ROADMAP.md).

## Local development

```bash
pnpm --filter @imageryx/api-worker dev   # http://localhost:8787
```

## Middleware

- **Request ID** — every request gets an `X-Request-Id` (reused if the
  caller already sent one), echoed back on the response for log
  correlation.
- **Structured logging** — one JSON line per request via `console.log`.
- **CORS** — restricted to `DASHBOARD_URL` (see `wrangler.jsonc`).
- **Central error handling** — `app.onError`/`app.notFound` return typed
  JSON errors and never leak stack traces.

## Configuration

Non-secret local defaults live in `wrangler.jsonc` under `vars`. Bindings
are typed via `wrangler types` (run automatically as part of `pnpm
typecheck`) — see `worker-configuration.d.ts` (generated, git-ignored).
