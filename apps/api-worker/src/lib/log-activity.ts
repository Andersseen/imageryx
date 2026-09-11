import type { Context } from "hono";
import type { AppVariables } from "./app-variables";

/**
 * Structured-log entry point for project/folder/preset-level events that
 * have no asset to attach to — `asset_activity` is intentionally
 * asset-scoped (see `@imageryx/database`'s `PresetPersistenceService` and
 * context.md's "Activity events" note), so these events are observable
 * via logs, not `GET /v1/assets/:id/activity`. Asset-scoped events use
 * `AssetActivityRepository.record` directly instead.
 */
export function logActivity<E extends { Variables: AppVariables }>(
  c: Context<E>,
  event: string,
  metadata: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      event,
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
      ...metadata,
    }),
  );
}
