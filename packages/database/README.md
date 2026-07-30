# @imageryx/database

Database schema and repository interfaces for Imageryx.

## Phase 1 status

This package is a placeholder. It contains no schema, migrations, or
repository implementations yet — only package metadata so the workspace
resolves, and so later phases have a stable import path
(`@imageryx/database`) to build against.

## Deferred to a later phase

- D1 schema and migrations for assets, projects, and presets.
- Repository interfaces and implementations consumed by `api-worker`.
- Query/test helpers backed by local D1 simulation.
