# @imageryx/image-core

Provider-independent image transformation core.

## Phase 1 status

This package is a placeholder. It contains no transformation logic yet —
only package metadata so the workspace resolves, and so later phases have a
stable import path (`@imageryx/image-core`) to build against.

## Deferred to a later phase

- Decode/resize/crop/encode pipeline, independent of any storage or
  transformation provider.
- Format negotiation (AVIF/WebP/JPEG fallback).
- Consumed by `processing-worker` once real jobs exist.
