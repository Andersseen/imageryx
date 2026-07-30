# @imageryx/providers

Storage and transformation provider identifiers shared across Imageryx apps.

## Phase 1 status

Only the type-level identifiers (`StorageProviderId`, `TransformationProviderId`)
are exported. They let `api-worker` and the dashboard agree on the *names*
of the currently-configured placeholder providers (`local`, `mock`) without
either side hardcoding string literals. No provider client, network call, or
credential handling exists in this package yet.

## Deferred to a later phase

- `StorageProvider` / `TransformationProvider` interfaces.
- Concrete R2, Cloudinary, and in-house transformation implementations.
- Provider selection/config resolution consumed by `api-worker` and
  `processing-worker`.
