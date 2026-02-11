"use client";

import { useLiveOccupancy } from "@/hooks/useLiveOccupancy";

interface LiveOccupancyProps {
  doorwayIds: string[];
  capacity?: number;
}

export default function LiveOccupancy({
  doorwayIds,
  capacity,
}: LiveOccupancyProps) {
  const { totalCount, allConnected, anyConnected } =
    useLiveOccupancy(doorwayIds);

  const occupancyPercent = capacity ? (totalCount / capacity) * 100 : null;

  const barColor =
    occupancyPercent === null
      ? "bg-blue-500"
      : occupancyPercent > 80
        ? "bg-red-500"
        : occupancyPercent > 50
          ? "bg-yellow-500"
          : "bg-green-500";

  const statusColor = allConnected
    ? "bg-green-400"
    : anyConnected
      ? "bg-yellow-400"
      : "bg-red-400";

  const statusText = allConnected
    ? "Connected"
    : anyConnected
      ? "Partially connected"
      : "Disconnected";

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-700">
          Live Occupancy
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor}`}
          />
          <span className="text-sm text-gray-500">{statusText}</span>
        </div>
      </div>

      <div className="text-center mb-4">
        <span className="text-6xl font-bold text-gray-900 tabular-nums">
          {totalCount}
        </span>
        {capacity && (
          <span className="text-2xl text-gray-400 ml-2">/ {capacity}</span>
        )}
        <p className="text-sm text-gray-500 mt-1">
          current occupants (since page load)
        </p>
      </div>

      {capacity && (
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{
              width: `${Math.min(Math.max(occupancyPercent || 0, 0), 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
