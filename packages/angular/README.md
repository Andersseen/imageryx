# @imageryx/angular

Angular bindings for the Imageryx SDK.

## Phase 1 status

This package is a placeholder and intentionally has no dependency on
`@angular/core` yet. It contains package metadata only, so the workspace
resolves and later phases have a stable import path (`@imageryx/angular`)
to build against.

## Deferred to a later phase

- `ix-image` directive that renders a transformed asset URL from
  `@imageryx/sdk`.
- Preset/format pipes.
- Built with `ng-packagr` once there is real component/directive code to
  package.
