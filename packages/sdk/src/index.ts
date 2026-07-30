/**
 * @imageryx/sdk
 *
 * Framework-agnostic TypeScript client for the Imageryx API — standard
 * Fetch only, no Node-specific APIs, so it works unchanged in browsers,
 * Workers, and Node 18+. `@imageryx/angular` builds delivery URLs
 * directly (see its own README) rather than depending on this package,
 * to keep the browser-facing image component free of anything
 * API-key-aware.
 */
export { ImageryxClient, createImageryxClient, type ImageryxClientConfig } from "./client";
export { DeliveryResource, type ResponsivePresetEntry } from "./delivery";
export { ImageryxApiError, ImageryxNetworkError, ImageryxValidationError } from "./errors";
export { SnippetsResource, type SnippetInput } from "./snippets";
export * from "./types";
