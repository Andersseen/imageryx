# Architecture

This document describes how Imageryx's apps fit together: what each one
does today (Phase 1) and what it is designed to do once later phases land.
See [ROADMAP.md](ROADMAP.md) for the phase breakdown and
[context.md](context.md) for product/technology decisions.

## Applications

```
apps/
  dashboard/          Analog + Angular 21 — project/asset management UI
  api-worker/          Cloudflare Worker (Hono) — public API entry point
  delivery-worker/      Cloudflare Worker (Hono) — asset delivery edge
  processing-worker/    Cloudflare Worker — transformation job runner
```

### dashboard

**Responsibility:** the human-facing control plane — browsing assets,
managing projects/presets, inspecting API usage, and (this phase) showing
whether the rest of the system is healthy.

- **Phase 1 (current):** application shell, navigation, theme, and an
  Overview page that polls every Worker's `/health` endpoint live. The
  other six routes are static "upcoming" placeholders.
- **Later phases:** real asset library, project/preset CRUD, upload flow,
  API key management — all built on `@imageryx/sdk` and `@imageryx/angular`.

### api-worker

**Responsibility:** the single public entry point. Owns auth, request
validation, and orchestration — it never touches image bytes directly.

- **Phase 1 (current):** `GET /health`, `GET /v1/info` only. Request ID
  middleware, structured logging, CORS (scoped to the local dashboard
  origin), and central error handling are in place so business routes have
  somewhere consistent to land.
- **Later phases:** upload routes (issuing storage writes via
  `@imageryx/providers`), transformation-request routes (enqueuing jobs
  for `processing-worker`), and project/preset/API-key CRUD backed by
  `@imageryx/database`.

### delivery-worker

**Responsibility:** the read path. Serves transformed assets to end users,
cache-first, independent of `api-worker`'s request/response cycle.

- **Phase 1 (current):** `GET /health` and `GET /preview-placeholder`, a
  small SVG generated in code — no stored assets, no cache, no R2.
- **Later phases:** fetches a transformed asset (from cache or by asking
  `processing-worker` to produce it), sets long-lived cache headers, and
  serves it. Never runs untrusted transformation logic itself.

### processing-worker

**Responsibility:** runs transformation jobs off the request path, so
`api-worker` and `delivery-worker` stay fast and don't block on CPU-heavy
image work.

- **Phase 1 (current):** `GET /health` plus a Cloudflare Queue consumer
  that only understands one job shape — a typed placeholder it
  acknowledges (or retries, if malformed). No image decoding happens.
- **Later phases:** consumes real transformation jobs, calls into
  `@imageryx/image-core` for the actual pixel work, and writes the result
  back to storage via `@imageryx/providers`.

## Provider-independent design

Storage and transformation are modeled as *providers*, not hardcoded
integrations:

- `@imageryx/providers` currently exports only the **identifiers**
  (`StorageProviderId`, `TransformationProviderId`) — the vocabulary every
  app uses to describe which backend is configured. `api-worker`'s
  `/v1/info` route reports the active ones (`local` / `mock` today).
- No app imports an R2 SDK, a Cloudinary SDK, or any other vendor client
  directly. When Phase 2/3 add real providers, they implement a shared
  interface in `@imageryx/providers`, and `api-worker`/`processing-worker`
  select an implementation by provider ID — the call sites don't change.
- This is why Phase 1 ships `STORAGE_PROVIDER=local` and
  `TRANSFORMATION_PROVIDER=mock` as the only configured providers: there's
  nothing provider-specific to swap yet, and no app should be written as
  though there were.

## Planned data flows

These flows describe **future** behavior. Nothing below is implemented in
Phase 1 — every step here is scoped to Phase 2 or Phase 3 in the roadmap.

### Upload flow (Phase 2)

1. Dashboard (or an SDK consumer) sends the file to `api-worker`.
2. `api-worker` validates the request, writes the original via the
   configured `StorageProvider`, and records metadata through
   `@imageryx/database`.
3. `api-worker` returns an asset ID and a delivery URL template.

### Processing flow (Phase 3)

1. A transformation is requested (either at upload time or on first
   delivery request for a given variant).
2. `api-worker` (or `delivery-worker`, for on-demand variants) enqueues a
   job for `processing-worker`.
3. `processing-worker` runs the pipeline in `@imageryx/image-core` and
   writes the result via the configured `StorageProvider`.

### Delivery flow (Phase 3)

1. A client requests an asset variant from `delivery-worker`.
2. `delivery-worker` checks cache; on a hit, it serves directly.
3. On a miss, it fetches the source via `StorageProvider`, requests (or
   waits for) the transformation, caches the result, and serves it.

## Shared packages

| Package | Phase 1 role |
| --- | --- |
| `contracts` | `HealthCheckResponse` shape shared by every app |
| `providers` | Storage/transformation provider *identifiers* only |
| `test-utils` | `isValidHealthCheckResponse` runtime check, shared by every health test |
| `typescript-config`, `eslint-config` | Shared strict TS/lint configuration |
| `database`, `image-core`, `sdk`, `angular` | Metadata-only placeholders — see each package's README for what's deferred |
