/**
 * @imageryx/image-core
 *
 * Placeholder entry point. The provider-independent transformation
 * pipeline (decode, resize, crop, re-encode) is implemented in a later
 * phase, once `processing-worker` has real jobs to run. Phase 1 only needs
 * this package to exist and resolve correctly across the workspace.
 */

export const IMAGE_CORE_PACKAGE_PHASE = 1 as const;
