# @imageryx/image-core

Provider-independent image domain logic. Depends only on
`@imageryx/contracts` — never on `@imageryx/database`, Hono, Angular,
Cloudflare, or Cloudinary.

## Phase 2 status

- `assets/` — filename normalization (Unicode strategy documented inline),
  aspect ratio.
- `paths/` — logical-path normalize/join/validate (strict: traversal,
  repeated separators, and encoded tricks are rejected, never silently
  collapsed), opaque physical storage-key builders, public asset-path
  generation.
- `security/` — SHA-256 checksums (Web Crypto, Node/Workers-compatible),
  MIME/magic-byte signature detection and validation (JPEG/PNG/GIF/WebP/AVIF,
  plus a conservative SVG structural sniff that classifies but never
  sanitizes).
- `presets/` — preset normalization + deterministic SHA-256 hashing,
  transformation-chain validation (duplicates, conflicts, bounds, max
  operation count), deterministic variant naming.
- `processing/` — job/variant status-transition guards, a generate-variant
  idempotency key.
- `providers/` — `TransformationProviderCapabilities` and a pure
  `selectTransformationProvider` (mock / Cloudflare / Cloudinary /
  explicit `UnsupportedOperationError` — never a silent drop).
- `errors/` — typed domain errors, each with a stable `code`.

120 tests, no mocking of its own logic (pure functions of their inputs).

## Deferred to a later phase

- The actual decode/resize/crop/encode pixel pipeline — real
  transformation happens inside a `TransformationProvider.transform()`
  call (`@imageryx/providers`), not in this package.
- Consumption by `processing-worker` for real jobs (Phase 3).
