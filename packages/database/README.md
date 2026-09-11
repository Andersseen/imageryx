# @imageryx/database

D1 schema, migrations, and repository classes for Imageryx. Depends only
on `@imageryx/contracts` and `@imageryx/image-core`.

## Phase 2 status

- `migrations/0001_initial_schema.sql` — 10 tables (`projects`, `folders`,
  `assets`, `tags`, `asset_tags`, `presets`, `variants`, `processing_jobs`,
  `api_keys`, `asset_activity`), parameterized-query-only repositories,
  partial-unique-index constraints where `NULL` needs to participate in
  uniqueness (sibling folder slugs, active asset paths, duplicate
  variants).
- `src/repositories/` — 8 repository classes wrapping all reads/writes;
  JSON columns (`presets.operations`, `processing_jobs.input`/`result`)
  are re-validated against their Zod schema on every read, never trusted
  blindly.
- `src/services/` — `AssetPersistenceService`, `PresetPersistenceService`,
  `VariantPersistenceService` for cross-table writes; two use real
  `db.batch()` atomicity.
- `src/testing/` (subpath export `@imageryx/database/testing`, Node-only)
  — a Miniflare-backed D1 test harness with every migration applied, used
  by this package's own tests and re-exported through
  `@imageryx/test-utils/node`.
- `scripts/seed.ts` — reads `apps/api-worker/wrangler.jsonc` and writes to
  the exact same local D1/storage state `wrangler dev` uses (see
  `pnpm db:seed:local`).

61 repository/service tests run against a real D1-compatible SQLite
database, not mocks.

## Deferred to a later phase

No production API routes consume these repositories yet — that's Phase
3's upload/asset CRUD routes on `api-worker`.

## Self-host Phase A: runtime-independent execution

Repositories/services are now written against a `DatabaseClient` interface
(`src/client.ts`), not `D1Database` directly. Two adapters implement it:

- `createD1DatabaseClient` (main barrel) — Cloudflare, unchanged behavior.
- `createSqliteDatabaseClient` (`@imageryx/database/node` subpath,
  Node-only — `node:sqlite`, never reachable from a Worker bundle) —
  backs `apps/self-hosted`.

Both run the same `migrations/*.sql` files. `src/testing/` now exposes
`createSqliteTestDatabase()` alongside the existing D1 harness, and
`describeRepositoryContract()` (`src/testing/repository-contract.ts`) runs
one shared assertion suite against both — see
`repository-contract.d1.spec.ts` / `repository-contract.sqlite.spec.ts`.
`@imageryx/database/node` also has the self-host migration runner
(`pnpm migrate:self-hosted` / `status:self-hosted` / `reset:self-hosted`
from this package, or the root `pnpm db:*:self-hosted` aliases). See the
root README's "Self-hosting" section and context.md's "Self-host Phase A
decisions and limitations" for the full detail.
