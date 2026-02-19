"use client";

import { useMemo } from "react";
import ClassRow from "@/components/ClassRow";
import { useHistoricalData } from "@/hooks/useHistoricalData";
import { useLiveOccupancy } from "@/hooks/useLiveOccupancy";
import { useClassStatus } from "@/hooks/useClassStatus";
import { fromNZLocal, addMinutesNZ } from "@/lib/nz-time";
import type { ClassGroup } from "@/lib/back-to-back";

interface ClassGroupWrapperProps {
  group: ClassGroup;
  spaceId: string;
  spaceName: string;
  doorwayIds: string[];
  globalBufferBefore: number;
  globalBufferAfter: number;
  countAtOffset: number;
  onTimeChange: (classId: string, time: string) => void;
  onBufferOverrideChange: (classId: string, before: number | null, after: number | null) => void;
  onRemove: (classId: string) => void;
}

const EMPTY_DOORWAY_IDS: string[] = [];

export default function ClassGroupWrapper({
  group,
  spaceId,
  spaceName,
  doorwayIds,
  globalBufferBefore,
  globalBufferAfter,
  countAtOffset,
  onTimeChange,
  onBufferOverrideChange,
  onRemove,
}: ClassGroupWrapperProps) {
  // For non-linked groups (single class), just render ClassRow directly
  if (!group.isLinked) {
    const cls = group.classes[0];
    return (
      <ClassRow
        key={cls.id}
        spaceId={cls.spaceId}
        spaceName={spaceName}
        date={cls.date}
        time={cls.time}
        globalBufferBefore={globalBufferBefore}
        globalBufferAfter={globalBufferAfter}
        bufferBeforeOverride={cls.bufferBeforeOverride}
        bufferAfterOverride={cls.bufferAfterOverride}
        className={cls.className}
        instructor={cls.instructor}
        doorwayIds={doorwayIds}
        countAtOffset={countAtOffset}
        onTimeChange={(t) => onTimeChange(cls.id, t)}
        onBufferOverrideChange={(before, after) =>
          onBufferOverrideChange(cls.id, before, after)
        }
        onRemove={() => onRemove(cls.id)}
      />
    );
  }

  // Linked group: render with shared data fetching
  return (
    <LinkedClassGroup
      group={group}
      spaceId={spaceId}
      spaceName={spaceName}
      doorwayIds={doorwayIds}
      globalBufferBefore={globalBufferBefore}
      globalBufferAfter={globalBufferAfter}
      countAtOffset={countAtOffset}
      onTimeChange={onTimeChange}
      onBufferOverrideChange={onBufferOverrideChange}
      onRemove={onRemove}
    />
  );
}

function LinkedClassGroup({
  group,
  spaceId,
  spaceName,
  doorwayIds,
  globalBufferBefore,
  globalBufferAfter,
  countAtOffset,
  onTimeChange,
  onBufferOverrideChange,
  onRemove,
}: ClassGroupWrapperProps) {
  const { classes } = group;
  const firstClass = classes[0];
  const lastClass = classes[classes.length - 1];

  // Compute merged window: from first class start - buffer to last class start + buffer
  const { mergedStartUTC, mergedEndUTC } = useMemo(() => {
    const firstBefore = firstClass.bufferBeforeOverride ?? globalBufferBefore;
    const lastAfter = lastClass.bufferAfterOverride ?? globalBufferAfter;

    if (!firstClass.time || !lastClass.time || !firstClass.date) {
      return { mergedStartUTC: "", mergedEndUTC: "" };
    }

    const startLocal = addMinutesNZ(firstClass.date, firstClass.time, -firstBefore);
    const endLocal = addMinutesNZ(lastClass.date, lastClass.time, lastAfter);
    return {
      mergedStartUTC: fromNZLocal(startLocal),
      mergedEndUTC: fromNZLocal(endLocal),
    };
  }, [firstClass, lastClass, globalBufferBefore, globalBufferAfter]);

  // Fetch historical data once for the merged window
  const { data, loading, error, refetch } = useHistoricalData(
    spaceId,
    mergedStartUTC,
    mergedEndUTC,
    "1m"
  );

  // Determine if any class in the group is live
  const firstBefore = firstClass.bufferBeforeOverride ?? globalBufferBefore;
  const lastAfter = lastClass.bufferAfterOverride ?? globalBufferAfter;
  const groupStatus = useClassStatus(firstClass.date, firstClass.time, firstBefore, lastAfter);
  const isGroupLive = groupStatus === "live";

  const liveDoorwayIds = isGroupLive && doorwayIds.length > 0 ? doorwayIds : EMPTY_DOORWAY_IDS;
  useLiveOccupancy(liveDoorwayIds);

  // Trigger refetch when group transitions from live to completed
  const prevIsLive = useMemo(() => isGroupLive, [isGroupLive]);
  if (!prevIsLive && data.length === 0 && !loading && mergedStartUTC) {
    // This will be handled by ClassRow's own refetch logic
  }

  return (
    <div className="relative">
      {/* Linked indicator bar */}
      <div className="absolute left-0 top-2 bottom-2 w-1 bg-purple-300 rounded-full" />

      <div className="pl-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
            Linked ({classes.length} back-to-back)
          </span>
        </div>

        {classes.map((cls) => (
          <ClassRow
            key={cls.id}
            spaceId={cls.spaceId}
            spaceName={spaceName}
            date={cls.date}
            time={cls.time}
            globalBufferBefore={globalBufferBefore}
            globalBufferAfter={globalBufferAfter}
            bufferBeforeOverride={cls.bufferBeforeOverride}
            bufferAfterOverride={cls.bufferAfterOverride}
            className={cls.className}
            instructor={cls.instructor}
            doorwayIds={doorwayIds}
            countAtOffset={countAtOffset}
            prefetchedData={data}
            prefetchedLoading={loading}
            prefetchedError={error}
            isLinked
            onTimeChange={(t) => onTimeChange(cls.id, t)}
            onBufferOverrideChange={(before, after) =>
              onBufferOverrideChange(cls.id, before, after)
            }
            onRemove={() => onRemove(cls.id)}
          />
        ))}
      </div>
    </div>
  );
}
