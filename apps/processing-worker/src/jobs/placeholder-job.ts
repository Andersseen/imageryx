/**
 * Typed shape of the one job kind this phase understands. Real
 * transformation jobs (resize/format/crop requests referencing an
 * uploaded asset) are introduced in a later phase alongside
 * `@imageryx/image-core`.
 */
export interface PlaceholderProcessingJob {
  kind: 'placeholder';
  jobId: string;
  enqueuedAt: string;
}

export function isPlaceholderProcessingJob(value: unknown): value is PlaceholderProcessingJob {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const job = value as Record<string, unknown>;

  return (
    job['kind'] === 'placeholder' &&
    typeof job['jobId'] === 'string' &&
    job['jobId'].length > 0 &&
    typeof job['enqueuedAt'] === 'string' &&
    !Number.isNaN(Date.parse(job['enqueuedAt']))
  );
}
