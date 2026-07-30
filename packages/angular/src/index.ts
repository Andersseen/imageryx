/**
 * @imageryx/angular
 *
 * Placeholder entry point. This package does not depend on @angular/core
 * yet and exports no components/directives/pipes: the `ix-image` directive
 * and preset pipes described in ARCHITECTURE.md are implemented in a later
 * phase, once `@imageryx/sdk` has a real client to wrap. Phase 1 only needs
 * this package to exist and resolve correctly across the workspace.
 */

export const ANGULAR_PACKAGE_PHASE = 1 as const;
