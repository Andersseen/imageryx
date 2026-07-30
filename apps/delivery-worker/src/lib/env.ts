import { R2StorageProvider } from "@imageryx/providers";
import type { StorageProvider } from "@imageryx/providers";

/**
 * Delivery Worker only ever reads already-persisted objects from R2 — it
 * never transforms anything itself, so it skips `parseProviderConfig`'s
 * env-driven provider selection entirely (that's an `api-worker`/
 * `processing-worker` concern) and constructs the R2 provider directly.
 */
export function getStorageProvider(env: Env): StorageProvider {
  return new R2StorageProvider(env.ASSET_STORAGE);
}
