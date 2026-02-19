import type { MetricsBucket } from "./density-api";

/**
 * Find the occupancy count at a specific offset after class start.
 * Searches the buckets for the one closest to classStartUtc + offsetMinutes,
 * within a 2-minute tolerance.
 */
export function findCountAtOffset(
  buckets: MetricsBucket[],
  classStartUtc: string,
  offsetMinutes: number
): { count: number | null; bucketTimestamp: string | null } {
  if (!classStartUtc || buckets.length === 0) {
    return { count: null, bucketTimestamp: null };
  }

  const targetMs =
    new Date(classStartUtc).getTime() + offsetMinutes * 60 * 1000;

  let closest: MetricsBucket | null = null;
  let closestDiff = Infinity;

  for (const bucket of buckets) {
    const diff = Math.abs(new Date(bucket.timestamp).getTime() - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = bucket;
    }
  }

  // Only use if within 2 minutes of target
  if (!closest || closestDiff > 2 * 60 * 1000) {
    return { count: null, bucketTimestamp: null };
  }

  return {
    count: closest.occupancy_avg,
    bucketTimestamp: closest.timestamp,
  };
}
