/**
 * Compares two strings without short-circuiting on the first byte
 * mismatch, so response timing does not reveal how many leading
 * characters of a secret (e.g. a Bearer API key) matched. Genuinely
 * constant-time only when `a` and `b` are the same length; a length
 * mismatch is still folded into the accumulator rather than returned
 * immediately, so the *length check itself* doesn't leak via an early return.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const length = Math.max(aBytes.length, bBytes.length, 1);

  let mismatch = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    const x = i < aBytes.length ? aBytes[i] : 0;
    const y = i < bBytes.length ? bBytes[i] : 0;
    mismatch |= (x ?? 0) ^ (y ?? 0);
  }
  return mismatch === 0;
}
