# @imageryx/providers

Storage and transformation provider interfaces and implementations.
Depends only on `@imageryx/contracts` and `@imageryx/image-core`.

## Phase 2 status

- `storage/storage-provider.ts` / `transformations/transformation-provider.ts`
  — the shared interfaces.
- `storage/local-storage.provider.ts` — real, filesystem-backed
  (`<key>.meta.json` sidecar for metadata, traversal-safe, atomic-ish
  writes). **Node-only** — behind the `@imageryx/providers/node` subpath,
  never the main barrel, since it uses `node:fs` and cannot run in
  workerd.
- `storage/r2-storage.provider.ts` — compiles against the real `R2Bucket`
  binding type, dependency-injected, makes no request in this phase.
- `transformations/mock-transformation.provider.ts` — real, deterministic
  simulated transforms (derives dimensions, resolves `auto` format,
  fabricates a plausible size, returns an explicit `simulated: true`, and
  deterministically fails when the asset slug contains `"fail"`).
- `transformations/cloudflare-images.provider.ts` /
  `cloudinary.provider.ts` — pure parameter-mapping functions (no real
  network calls); Cloudinary supports the full operation set (crop,
  grayscale) that Cloudflare's standard resizing API cannot express.
- `config/provider-config.schema.ts` — Zod-validated env config, fails
  fast on an invalid/incomplete provider combination.
- `registry/provider-registry.ts` — selects an implementation from
  validated config; the Workers-safe version throws for
  `storageProvider: 'local'`, `@imageryx/providers/node`'s registry adds
  that case back.

69 tests covering local storage (real filesystem, isolated temp dirs),
the mock provider, both mapping adapters (including Cloudinary's real
signing algorithm), config validation, and the registry.

## Deferred to a later phase

Real Cloudflare Images / Cloudinary network calls and a real R2 upload
path — both compile and are structurally ready, but Phase 2 explicitly
excludes exercising them against a live account/bucket.
