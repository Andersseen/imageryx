/**
 * @imageryx/sdk
 *
 * Placeholder entry point. The framework-agnostic client (upload,
 * transform, and delivery URL helpers) is implemented in a later phase,
 * once `api-worker` exposes business routes to wrap. Phase 1 only needs
 * this package to exist and resolve correctly across the workspace.
 */

export const SDK_PACKAGE_PHASE = 1 as const;
