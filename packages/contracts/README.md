# @imageryx/contracts

Shared Zod schemas and inferred TypeScript types exchanged between
Imageryx apps and packages — the innermost package in the dependency
graph (depends on nothing but Zod).

## Phase 2 status

Full domain contracts, organized by domain under `src/`:

- `common/` — UUIDs, slugs, normalized logical paths, timestamps,
  checksums, MIME/extension mappings, pagination, sorting, API errors, and
  the Phase 1 `HealthCheckResponse` shape.
- `projects/`, `folders/`, `assets/`, `presets/` (including the
  `ImageOperation` discriminated union), `variants/`, `processing/` —
  domain schemas plus create/update/list/delete request contracts for
  each.
- `providers/` — `StorageProviderName` / `TransformationProviderName`.

Contracts are shape/validation only — no business logic (e.g. duplicate
preset-operation detection, path traversal rejection) lives here; that's
`@imageryx/image-core`'s job, which depends on this package, not the other
way around.

## Deferred to a later phase

Nothing structural — the domain vocabulary is complete for Phase 3's
upload/CRUD routes to build on. Individual fields may still grow as real
routes surface requirements this phase's diagnostics-only usage didn't.
