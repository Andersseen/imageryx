/**
 * `@imageryx/providers/node`
 *
 * Node-only additions: `LocalStorageProvider` (real filesystem — cannot
 * run in workerd) and a `createStorageProvider`/`createProviderRegistry`
 * pair that also handles `storageProvider: 'local'`. Import this subpath
 * from tooling scripts and tests, never from a deployed Worker.
 */
export * from "../storage/local-storage.provider";
export {
  createTransformationProvider,
  type CreateProviderRegistryOptions,
  type CreateStorageProviderOptions,
  type ProviderRegistry,
} from "../registry/provider-registry";
export * from "./local-storage-registry";
