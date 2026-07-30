/**
 * A stable key two concurrently-enqueued requests for "the same work"
 * collapse onto, so `processing-worker`/the repository layer can dedupe
 * before creating a second job. Only `generate-variant` has a natural
 * idempotency key today (asset + preset hash uniquely determines the
 * work) — other job types are inherently one-shot or already
 * asset-scoped enough that a duplicate is a legitimate re-run, not a race.
 */
export function buildGenerateVariantJobKey(
  assetId: string,
  presetHash: string,
): string {
  return `generate-variant:${assetId}:${presetHash}`;
}
