# @imageryx/test-utils

Shared testing helpers for Imageryx apps and packages.

## Phase 1 status

Exports `isValidHealthCheckResponse`, a runtime type guard used by every
Worker's `/health` route test (and the dashboard's service-status mapping
test) to check the response shape against `@imageryx/contracts` in one
place instead of duplicating assertions per app.

## Deferred to a later phase

Fixture builders and mock provider helpers will be added once there is real
domain data (assets, jobs, presets) to fabricate for tests.
