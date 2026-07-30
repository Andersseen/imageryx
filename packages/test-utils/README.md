# @imageryx/test-utils

Shared testing helpers for Imageryx apps and packages.

## Phase 2 status

Main export (`@imageryx/test-utils`, Workers-safe — imported by
Worker tests running under `@cloudflare/vitest-pool-workers`):

- `isValidHealthCheckResponse` — the Phase 1 health-response type guard.
- Domain fixture builders: `createProjectFixture`, `createFolderFixture`,
  `createAssetFixture`, `createPresetFixture`, `createProcessingJobFixture`
  (each schema-validated against its own `@imageryx/contracts` schema in
  this package's own tests), plus `createImageBytesFixture` (tiny,
  correctly-signed byte sequences per supported MIME type, for
  `image-core`'s signature detection).

`@imageryx/test-utils/node` (Node-only — never import from a Worker test):

- `createTestDatabase` — re-exported from `@imageryx/database/testing`.
- `createTemporaryStorageDirectory` — an isolated temp dir for
  `LocalStorageProvider` tests.

## Deferred to a later phase

Nothing structural for this phase's scope — new fixture builders will be
added alongside whatever new domain data Phase 3's routes need to
fabricate for tests.
