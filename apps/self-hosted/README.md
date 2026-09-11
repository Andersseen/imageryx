# @imageryx/self-hosted

Minimal Node + SQLite runtime proving the Imageryx backend architecture
runs outside Cloudflare — **not** the complete self-hosted product yet.
See the root [README.md](../../README.md)'s "Self-hosting" section and
[ROADMAP.md](../../ROADMAP.md)'s staged self-hosting plan (A/B/C/D) for
what this is and isn't.

## What this proves

- `@imageryx/database`'s repositories run unmodified against a
  `SqliteDatabaseClient` (Node's built-in `node:sqlite`), the same
  migrations D1 uses, no compatibility shim.
- `api-worker`'s real `/v1/projects` route, `requestId`,
  `structuredLogger`, `errorHandler`, and `notFoundHandler` middleware run
  unmodified too, imported from `@imageryx/api-worker/portable` — not a
  reimplementation.
- Data survives a process restart (a real file, not `:memory:`).

## What this does not do yet

No asset upload, image processing, or storage (`/v1/assets`,
`/v1/processing-jobs`, `/v1/presets`, `/v1/tags`, `/v1/stats`,
`/v1/api-keys` are not mounted) and no authentication — see
context.md's "Self-host Phase A decisions and limitations" for exactly
why each is deferred, not silently missing.

## Commands

```bash
pnpm db:migrate:self-hosted   # from the repo root — applies migrations
pnpm --filter @imageryx/self-hosted run dev     # http://localhost:8790, --watch
pnpm --filter @imageryx/self-hosted run start   # same, no --watch
pnpm --filter @imageryx/self-hosted run test    # boots the real runtime over real HTTP
```

## Configuration

See `.env.example`. `RUNTIME`, `DATABASE_PROVIDER`, `DATABASE_PATH`,
`APP_ENV`, `PORT` — nothing else is required to boot.
