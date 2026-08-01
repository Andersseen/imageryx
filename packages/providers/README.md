# @imageryx/providers

Storage and transformation provider interfaces and implementations.
Depends only on `@imageryx/contracts` and `@imageryx/image-core`.

## Status (Phase 5)

- `storage/storage-provider.ts` / `transformations/transformation-provider.ts`
  — the shared interfaces.
- `storage/local-storage.provider.ts` — real, filesystem-backed
  (`<key>.meta.json` sidecar for metadata, traversal-safe, atomic-ish
  writes). **Node-only** — behind the `@imageryx/providers/node` subpath,
  never the main barrel, since it uses `node:fs` and cannot run in
  workerd. Local dev tooling/tests only — never constructed by a Worker.
- `storage/r2-storage.provider.ts` — **real and in production use**: all
  three Workers construct this against their `ASSET_STORAGE` R2 binding
  (Miniflare-simulated locally, a real bucket once deployed — see
  `docs/deployment-cloudflare.md`). Binding-level tests (`put`/`get`/
  `head`/`delete`/`exists`, stream bodies, missing-object handling) live in
  `apps/api-worker/test/r2-storage-provider.spec.ts` against a real R2
  binding — this package's own tests run under plain Node, which has none.
- `transformations/mock-transformation.provider.ts` — real, deterministic
  simulated transforms (derives dimensions, resolves `auto` format,
  fabricates a plausible size, returns an explicit `simulated: true`, and
  deterministically fails when the asset slug contains `"fail"`). This is
  the only transformation provider that does real work today — every
  variant this repo currently generates is a real, visibly-labeled
  simulated SVG produced through this provider.
- `transformations/cloudflare-images.provider.ts` /
  `cloudinary.provider.ts` — pure parameter-mapping functions, still
  **configuration-ready but network-execution-not-implemented**:
  `transform()` always throws `ProviderUnavailableError`. Cloudinary
  supports the full operation set (crop, grayscale) that Cloudflare's
  standard resizing API cannot express. Completing real network calls for
  either is out of Phase 5's scope (a major feature, not a hardening
  change) — see the root `ROADMAP.md`.
- `config/provider-config.schema.ts` — Zod-validated env config, fails
  fast on an invalid/incomplete provider combination.
- `registry/provider-registry.ts` — selects an implementation from
  validated config; the Workers-safe version throws for
  `storageProvider: 'local'`, `@imageryx/providers/node`'s registry adds
  that case back.

72 tests in this package covering local storage (real filesystem, isolated
temp dirs), the mock provider, both mapping adapters (including
Cloudinary's real signing algorithm — excludes secrets from the signature
base, never echoes them, produces a different signature per secret), config
validation, and the registry — plus 9 more in `apps/api-worker/test/`
exercising `R2StorageProvider` against a real R2 binding.

## Deferred, not this phase

Real Cloudflare Images / Cloudinary network calls — both providers compile
and are structurally ready (full parameter mapping, Cloudinary's real
signing algorithm), but making an actual authenticated request to either
service is deliberately out of scope until a phase that explicitly takes it
on.
