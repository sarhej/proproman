/** Simple in-memory sliding window rate limiter (per server instance). */

const buckets = new Map<string, number[]>();

export function allowWithinWindow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < windowMs);
  if (pruned.length >= max) {
    buckets.set(key, pruned);
    return false;
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return true;
}
