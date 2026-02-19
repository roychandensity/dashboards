"use client";

import { useLiveOccupancy } from "@/hooks/useLiveOccupancy";

interface LiveSensorFeedProps {
  doorwayIds: string[];
  doorwayNames: Record<string, string>;
  capacity?: number;
}

export default function LiveSensorFeed({
  doorwayIds,
  doorwayNames,
  capacity,
}: LiveSensorFeedProps) {
  const {
    totalCount,
    totalEntrances,
    totalExits,
    allConnected,
    anyConnected,
    doorwayStates,
    events,
    resetCounts,
  } = useLiveOccupancy(doorwayIds);

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-700">
            Live Sensor Verification
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              allConnected
                ? "text-green-600 bg-green-50"
                : anyConnected
                ? "text-amber-600 bg-amber-50"
                : "text-red-600 bg-red-50"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                allConnected
                  ? "bg-green-500 animate-pulse"
                  : anyConnected
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500"
              }`}
            />
            {allConnected
              ? "Connected"
              : anyConnected
              ? "Partially connected"
              : "Disconnected"}
          </span>
        </div>
        <button
          onClick={resetCounts}
          className="text-sm font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
        >
          Reset Count
        </button>
      </div>

      {/* Large count display */}
      <div className="text-center mb-4">
        <span className="text-6xl font-bold tabular-nums text-gray-900">
          {totalCount}
        </span>
        {capacity != null && (
          <span className="text-2xl text-gray-400 ml-2">/ {capacity}</span>
        )}
        <div className="flex justify-center gap-6 mt-2 text-sm">
          <span className="text-green-600">
            {totalEntrances} in
          </span>
          <span className="text-amber-600">
            {totalExits} out
          </span>
        </div>
      </div>

      {/* Per-doorway breakdown */}
      {doorwayIds.length > 1 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {doorwayIds.map((id) => {
            const state = doorwayStates[id];
            return (
              <div key={id} className="bg-gray-50 rounded-lg p-2 text-sm">
                <span
                  className={`w-2 h-2 rounded-full inline-block mr-1 ${
                    state?.connected ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className="font-medium">
                  {doorwayNames[id] || id}
                </span>
                : {state?.count ?? 0}
                <span className="text-gray-400 ml-1">
                  ({state?.entrances ?? 0} in / {state?.exits ?? 0} out)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Event feed */}
      <div className="border rounded-lg max-h-64 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            Waiting for sensor events...
          </div>
        ) : (
          events
            .slice()
            .reverse()
            .map((evt, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 text-sm border-b last:border-b-0 ${
                  evt.direction === 1 ? "bg-green-50" : "bg-amber-50"
                }`}
              >
                <span className="text-gray-400 mr-2 tabular-nums">
                  {evt.timestamp.toLocaleTimeString("en-NZ", {
                    timeZone: "Pacific/Auckland",
                  })}
                </span>
                <span
                  className={
                    evt.direction === 1
                      ? "text-green-700 font-medium"
                      : "text-amber-700 font-medium"
                  }
                >
                  {evt.direction === 1 ? "Entrance" : "Exit"}
                </span>
                {doorwayIds.length > 1 && (
                  <span className="text-gray-400 ml-2">
                    {doorwayNames[evt.doorwayId] || evt.doorwayId}
                  </span>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
