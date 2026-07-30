# @imageryx/contracts

Shared TypeScript contracts exchanged between Imageryx apps.

## Phase 1 status

Only `HealthCheckResponse` is exported, since it is the single contract every
Phase 1 service already implements. It exists to keep the dashboard's health
polling and each Worker's `/health` response in sync without duplicating the
shape by hand.

## Deferred to a later phase

Request/response contracts for uploads, transformation jobs, presets, and
asset metadata will be added once the corresponding services exist. They are
intentionally absent now rather than stubbed out, to avoid describing APIs
that do not exist yet.
