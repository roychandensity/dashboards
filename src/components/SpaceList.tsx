"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { DensitySpace } from "@/lib/density-api";

interface SpaceListProps {
  spaces: DensitySpace[];
  doorwayHealth: Record<string, string>; // doorway_id → health_status
}

function getSpaceHealthStatus(
  space: DensitySpace,
  doorwayHealth: Record<string, string>
): "healthy" | "degraded" | "offline" | "unknown" | null {
  const statuses = space.doorways.map(
    (d) => doorwayHealth[d.id] ?? null
  );
  if (statuses.every((s) => s === null)) return null;
  if (statuses.some((s) => s === "offline")) return "offline";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  if (statuses.some((s) => s === "unknown")) return "unknown";
  return "healthy";
}

const HEALTH_BADGE: Record<string, { label: string; className: string }> = {
  offline: {
    label: "Sensor offline",
    className: "bg-red-100 text-red-700",
  },
  degraded: {
    label: "Sensor degraded",
    className: "bg-amber-100 text-amber-700",
  },
  unknown: {
    label: "Sensor status unknown",
    className: "bg-gray-100 text-gray-600",
  },
};

export default function SpaceList({ spaces, doorwayHealth }: SpaceListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spaces;
    return spaces.filter((s) => s.name.toLowerCase().includes(q));
  }, [spaces, search]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search studios..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No studios matching &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((space) => {
            const health = getSpaceHealthStatus(space, doorwayHealth);
            const badge = health ? HEALTH_BADGE[health] : null;

            return (
              <Link
                key={space.id}
                href={`/space/${space.id}`}
                className="block bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {space.name}
                </h2>
                <p className="text-sm text-gray-500">
                  Capacity: {space.capacity ?? "unknown"}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {space.doorways.length} doorway
                  {space.doorways.length !== 1 ? "s" : ""}
                </p>
                {badge && (
                  <span
                    className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
