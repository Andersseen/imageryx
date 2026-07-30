# @imageryx/processing-worker

Health endpoint and Cloudflare Queue consumer structure for future image
transformation jobs.

## Phase 1 surface

| Surface | Description |
| --- | --- |
| `GET /health` | Liveness check — service, status, environment, version, timestamp |
| Queue consumer (`imageryx-processing-queue`) | Acknowledges a typed `PlaceholderProcessingJob`; retries anything else |

No image decoding, resizing, or encoding happens yet — see
[ROADMAP.md](../../ROADMAP.md) and [`@imageryx/image-core`](../../packages/image-core).

## Local development

```bash
pnpm --filter @imageryx/processing-worker dev   # http://localhost:8789
```

`wrangler dev` simulates the Queue locally, so the consumer runs without a
Cloudflare account or a deployed queue.
