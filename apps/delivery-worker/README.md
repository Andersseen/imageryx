# @imageryx/delivery-worker

Minimal [Hono](https://hono.dev) Worker standing in for the future asset
delivery edge.

## Phase 1 routes

| Route                            | Description                                                       |
| -------------------------------- | ----------------------------------------------------------------- |
| `GET /health`                    | Liveness check — service, status, environment, version, timestamp |
| `GET /preview-placeholder?w=&h=` | A small SVG generated in code (no stored assets, no R2)           |

Real asset delivery (fetching from storage, on-the-fly transformation, caching) is implemented in a later phase — see [ROADMAP.md](../../ROADMAP.md).

## Local development

```bash
pnpm --filter @imageryx/delivery-worker dev   # http://localhost:8788
```
