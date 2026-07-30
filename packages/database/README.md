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
