import type { ScheduleClass } from "./types";

export interface ClassGroup {
  /** All classes in this consecutive group, sorted by time */
  classes: ScheduleClass[];
  /** Whether this group has more than one class */
  isLinked: boolean;
}

/**
 * Given classes for a single space on a single date,
 * detect back-to-back sequences where one class's buffer window
 * overlaps or is adjacent to the next class's buffer window.
 *
 * Two classes are linked if the gap between them is <= gapThreshold minutes.
 * "Gap" = nextClassStart - bufferBefore - (currentClassStart + bufferAfter).
 */
export function detectBackToBack(
  classes: ScheduleClass[],
  globalBufferBefore: number,
  globalBufferAfter: number,
  gapThreshold: number = 5
): ClassGroup[] {
  if (classes.length === 0) return [];

  // Group by date first
  const byDate = new Map<string, ScheduleClass[]>();
  for (const cls of classes) {
    const key = cls.date;
    const arr = byDate.get(key) ?? [];
    arr.push(cls);
    byDate.set(key, arr);
  }

  const groups: ClassGroup[] = [];

  for (const [, dateClasses] of byDate) {
    // Sort by time ascending
    const sorted = [...dateClasses].sort((a, b) => a.time.localeCompare(b.time));

    let currentGroup: ScheduleClass[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // Skip classes with no time set
      if (!prev.time || !curr.time) {
        if (currentGroup.length > 0) {
          groups.push({
            classes: currentGroup,
            isLinked: currentGroup.length > 1,
          });
        }
        currentGroup = [curr];
        continue;
      }

      const prevAfter = prev.bufferAfterOverride ?? globalBufferAfter;
      const currBefore = curr.bufferBeforeOverride ?? globalBufferBefore;

      // Compute end of prev window and start of curr window in minutes from midnight
      const prevEndMin = timeToMinutes(prev.time) + prevAfter;
      const currStartMin = timeToMinutes(curr.time) - currBefore;

      const gap = currStartMin - prevEndMin;

      if (gap <= gapThreshold) {
        // Adjacent or overlapping — link them
        currentGroup.push(curr);
      } else {
        // Gap too large — finalize current group, start new one
        groups.push({
          classes: currentGroup,
          isLinked: currentGroup.length > 1,
        });
        currentGroup = [curr];
      }
    }

    // Finalize last group
    if (currentGroup.length > 0) {
      groups.push({
        classes: currentGroup,
        isLinked: currentGroup.length > 1,
      });
    }
  }

  return groups;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
