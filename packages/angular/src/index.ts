/**
 * @imageryx/angular
 *
 * Standalone Angular bindings for Imageryx delivery URLs: the
 * `<imgyx-image>` component (see `lib/imgyx-image.component.ts`). Depends
 * only on `@angular/core` and `@imageryx/image-core`'s pure delivery-path
 * builder — never `@imageryx/sdk` (which is API-key-aware) and never
 * calls `api-worker` directly. Packaged as plain TypeScript source
 * (resolved directly by the dashboard's own Vite/Analog build), the same
 * pattern every other package in this workspace uses — `ng-packagr`
 * packaging for external npm publishing is a later-phase concern (see
 * ROADMAP.md).
 */
export { ImgyxImage, type ImageFetchPriority, type ImageLoadingStrategy } from "./lib/imgyx-image.component";
export { type ResponsivePresetInput } from "./lib/image-url";
