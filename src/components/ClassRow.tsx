"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useHistoricalData } from "@/hooks/useHistoricalData";
import { useClassStatus, ClassStatus } from "@/hooks/useClassStatus";
import { useLiveOccupancy } from "@/hooks/useLiveOccupancy";
import { fromNZLocal, addMinutesNZ } from "@/lib/nz-time";

interface ClassRowProps {
  spaceId: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" or ""
  globalBufferBefore: number; // minutes
  globalBufferAfter: number; // minutes
  bufferBeforeOverride: number | null;
  bufferAfterOverride: number | null;
  className?: string;
  instructor?: string;
  doorwayIds?: string[];
  onTimeChange: (time: string) => void;
  onBufferOverrideChange: (before: number | null, after: number | null) => void;
  onRemove: () => void;
}

function formatTimeDisplay(nzLocal: string): string {
  const [, timePart] = nzLocal.split("T");
  if (!timePart) return "";
  const [hStr, mStr] = timePart.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Round an ISO timestamp to the nearest second and format as NZ local h:mm:ss AM/PM */
function formatChartTimestamp(ts: string): string {
  const ms = Date.parse(ts);
  if (isNaN(ms)) return ts;
  const rounded = new Date(Math.round(ms / 1000) * 1000);
  return rounded.toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

const EMPTY_DOORWAY_IDS: string[] = [];

export default function ClassRow({
  spaceId,
  date,
  time,
  globalBufferBefore,
  globalBufferAfter,
  bufferBeforeOverride,
  bufferAfterOverride,
  className: classLabel,
  instructor,
  doorwayIds,
  onTimeChange,
  onBufferOverrideChange,
  onRemove,
}: ClassRowProps) {
  const hasOverride = bufferBeforeOverride !== null || bufferAfterOverride !== null;
  const effectiveBefore = bufferBeforeOverride ?? globalBufferBefore;
  const effectiveAfter = bufferAfterOverride ?? globalBufferAfter;

  // Draft state for custom buffer inputs — only committed on Apply
  const [draftBefore, setDraftBefore] = useState(effectiveBefore);
  const [draftAfter, setDraftAfter] = useState(effectiveAfter);

  // Sync drafts when overrides are toggled on or reset
  useEffect(() => {
    setDraftBefore(effectiveBefore);
    setDraftAfter(effectiveAfter);
  }, [effectiveBefore, effectiveAfter]);

  const draftDirty = hasOverride && (draftBefore !== effectiveBefore || draftAfter !== effectiveAfter);

  const status: ClassStatus = useClassStatus(date, time, effectiveBefore, effectiveAfter);

  // Only connect WebSockets when class is live and doorwayIds are provided
  const liveDoorwayIds = status === "live" && doorwayIds && doorwayIds.length > 0
    ? doorwayIds
    : EMPTY_DOORWAY_IDS;
  const { totalCount, totalEntrances, totalExits, anyConnected } = useLiveOccupancy(liveDoorwayIds);

  const { startUTC, endUTC, startDisplay, endDisplay } = useMemo(() => {
    if (!time || !date) {
      return { startUTC: "", endUTC: "", startDisplay: "", endDisplay: "" };
    }
    const startLocal = addMinutesNZ(date, time, -effectiveBefore);
    const endLocal = addMinutesNZ(date, time, effectiveAfter);
    return {
      startUTC: fromNZLocal(startLocal),
      endUTC: fromNZLocal(endLocal),
      startDisplay: formatTimeDisplay(startLocal),
      endDisplay: formatTimeDisplay(endLocal),
    };
  }, [date, time, effectiveBefore, effectiveAfter]);

  const { data, loading, error, refetch } = useHistoricalData(
    spaceId,
    startUTC,
    endUTC,
    "1m"
  );

  // Refetch historical data when transitioning from live to completed
  const prevStatusRef = useRef<ClassStatus>(status);
  useEffect(() => {
    if (prevStatusRef.current === "live" && status === "completed") {
      refetch();
    }
    prevStatusRef.current = status;
  }, [status, refetch]);

  const stats = useMemo(() => {
    let entrances = 0;
    let exits = 0;
    for (const bucket of data) {
      entrances += bucket.entrances;
      exits += bucket.exits;
    }
    return { entrances, exits, net: entrances - exits };
  }, [data]);

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        label: formatChartTimestamp(d.timestamp),
        entrances: Math.round(d.entrances),
        exits: Math.round(d.exits),
      })),
    [data]
  );

  const classStartLabel = useMemo(() => {
    if (!time || !date) return "";
    const utc = fromNZLocal(`${date}T${time}`);
    return utc ? formatChartTimestamp(utc) : "";
  }, [date, time]);

  const hasTime = !!time;

  const handleToggleOverride = () => {
    if (hasOverride) {
      onBufferOverrideChange(null, null);
    } else {
      onBufferOverrideChange(globalBufferBefore, globalBufferAfter);
    }
  };

  const handleApplyOverride = () => {
    onBufferOverrideChange(draftBefore, draftAfter);
  };

  // Determine which stats to display based on status
  const isLive = status === "live";
  const isUpcoming = status === "upcoming";
  const displayStats = isLive
    ? [
        { label: "Entrances", value: totalEntrances, color: "text-green-600" },
        { label: "Exits", value: totalExits, color: "text-amber-600" },
        { label: "Net Occupancy", value: totalCount, color: "text-blue-600" },
      ]
    : [
        { label: "Entrances", value: stats.entrances, color: "text-green-600" },
        { label: "Exits", value: stats.exits, color: "text-amber-600" },
        { label: "Net Occupancy", value: stats.net, color: "text-blue-600" },
      ];

  return (
    <div className="bg-white rounded-xl shadow-md p-4">
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          Class time:
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>

        {hasTime && (
          <span className="text-sm text-gray-500">
            {startDisplay} &mdash; {endDisplay}
          </span>
        )}

        {(classLabel || instructor) && (
          <span className="text-sm text-gray-400">
            {[classLabel, instructor].filter(Boolean).join(" — ")}
          </span>
        )}

        {isUpcoming && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Upcoming
          </span>
        )}

        {isLive && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live tracking
            {anyConnected && (
              <span className="text-green-400 text-[10px]">WS</span>
            )}
          </span>
        )}

        <button
          onClick={handleToggleOverride}
          className={`text-sm ${hasOverride ? "text-blue-600 font-medium" : "text-gray-400 hover:text-gray-600"}`}
        >
          Custom buffers
        </button>

        <button
          onClick={onRemove}
          className="ml-auto text-sm text-red-500 hover:text-red-700"
        >
          Remove
        </button>
      </div>

      {hasOverride && (
        <div className="flex items-center gap-4 mb-3 pl-1">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            Before:
            <input
              type="number"
              min={0}
              max={60}
              value={draftBefore}
              onChange={(e) =>
                setDraftBefore(Math.max(0, parseInt(e.target.value) || 0))
              }
              className="border border-gray-300 rounded-md px-1.5 py-0.5 text-xs w-14"
            />
            <span className="text-gray-400">min</span>
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            After:
            <input
              type="number"
              min={0}
              max={60}
              value={draftAfter}
              onChange={(e) =>
                setDraftAfter(Math.max(0, parseInt(e.target.value) || 0))
              }
              className="border border-gray-300 rounded-md px-1.5 py-0.5 text-xs w-14"
            />
            <span className="text-gray-400">min</span>
          </label>
          <button
            onClick={handleApplyOverride}
            disabled={!draftDirty}
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              draftDirty
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Apply
          </button>
          <button
            onClick={() => onBufferOverrideChange(null, null)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Reset to global
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {displayStats.map((card) => (
          <div
            key={card.label}
            className="bg-gray-50 rounded-lg p-3 text-center"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">
              {card.label}
            </p>
            {!hasTime || isUpcoming ? (
              <p className="text-2xl font-bold text-gray-300">&mdash;</p>
            ) : isLive ? (
              <p className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </p>
            ) : loading ? (
              <p className="text-2xl font-bold text-gray-300 animate-pulse">
                --
              </p>
            ) : error ? (
              <p className="text-sm text-red-500">Error</p>
            ) : (
              <p className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {hasTime && !isUpcoming && (
        <div className="mt-4 h-[200px]">
          {isLive ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Chart will show after class ends</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400 animate-pulse">Loading chart...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">No data for this window</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {classStartLabel && (
                  <ReferenceLine
                    x={classStartLabel}
                    stroke="#6366f1"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: "Class start", position: "top", fontSize: 10, fill: "#6366f1" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="entrances"
                  name="Entrances"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="exits"
                  name="Exits"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
