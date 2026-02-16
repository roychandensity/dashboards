"use client";

import { useState, useCallback, useMemo } from "react";
import { DensitySpace } from "@/lib/density-api";
import { fromNZLocal } from "@/lib/nz-time";

interface ScheduleClass {
  spaceId: string;
  date: string;
  time: string;
  className: string;
  instructor: string;
  bufferBeforeOverride: number | null;
  bufferAfterOverride: number | null;
}

interface ExportPanelProps {
  spaces: DensitySpace[];
  schedule: ScheduleClass[];
  bufferBefore: number;
  bufferAfter: number;
}

export default function ExportPanel({
  spaces,
  schedule,
  bufferBefore,
  bufferAfter,
}: ExportPanelProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spaceMap = useMemo(() => {
    const map = new Map<string, DensitySpace>();
    for (const s of spaces) map.set(s.id, s);
    return map;
  }, [spaces]);

  const applyPreset = useCallback(
    (preset: "today" | "4h" | "24h") => {
      if (preset === "today") {
        // Compute range from earliest to latest class in schedule
        let earliest: Date | null = null;
        let latest: Date | null = null;
        for (const cls of schedule) {
          if (!cls.time) continue;
          const before = cls.bufferBeforeOverride ?? bufferBefore;
          const after = cls.bufferAfterOverride ?? bufferAfter;
          const startLocal = addMinutesSimple(cls.date, cls.time, -before);
          const endLocal = addMinutesSimple(cls.date, cls.time, after);
          const startUtc = fromNZLocal(startLocal);
          const endUtc = fromNZLocal(endLocal);
          if (!startUtc || !endUtc) continue;
          const s = new Date(startUtc);
          const e = new Date(endUtc);
          if (!earliest || s < earliest) earliest = s;
          if (!latest || e > latest) latest = e;
        }
        if (earliest && latest) {
          setStartDate(toDatetimeLocal(earliest));
          setEndDate(toDatetimeLocal(latest));
        }
      } else {
        const now = new Date();
        const hours = preset === "4h" ? 4 : 24;
        const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
        setStartDate(toDatetimeLocal(start));
        setEndDate(toDatetimeLocal(now));
      }
      setError(null);
    },
    [schedule, bufferBefore, bufferAfter]
  );

  const handleExport = useCallback(async () => {
    if (!startDate || !endDate) {
      setError("Please select a date range");
      return;
    }

    const startUtc = new Date(startDate + ":00Z").toISOString();
    const endUtc = new Date(endDate + ":00Z").toISOString();

    // Deduplicate spaces present in schedule
    const spaceIds = [...new Set(schedule.map((c) => c.spaceId))];
    const spacesPayload = spaceIds
      .map((id) => {
        const s = spaceMap.get(id);
        return s ? { spaceId: id, spaceName: s.name } : null;
      })
      .filter(Boolean);

    const classesPayload = schedule
      .filter((c) => c.time)
      .map((c) => ({
        spaceId: c.spaceId,
        className: c.className,
        instructor: c.instructor,
        date: c.date,
        time: c.time,
        bufferBefore: c.bufferBeforeOverride ?? bufferBefore,
        bufferAfter: c.bufferAfterOverride ?? bufferAfter,
      }));

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaces: spacesPayload,
          startDate: startUtc,
          endDate: endUtc,
          classes: classesPayload,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "density-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, schedule, spaceMap, bufferBefore, bufferAfter]);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm font-medium text-gray-700">
          Start (UTC)
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setError(null); }}
            className="mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>

        <label className="flex flex-col text-sm font-medium text-gray-700">
          End (UTC)
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setError(null); }}
            className="mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </label>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Presets:</span>
          <button
            onClick={() => applyPreset("today")}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Today&apos;s Schedule
          </button>
          <button
            onClick={() => applyPreset("4h")}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Last 4 Hours
          </button>
          <button
            onClick={() => applyPreset("24h")}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Last 24 Hours
          </button>
        </div>

        <button
          onClick={handleExport}
          disabled={loading || !startDate || !endDate}
          className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {loading && (
        <p className="mt-2 text-sm text-gray-500 animate-pulse">
          Fetching data at 1-minute resolution. This may take a moment for large ranges...
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function addMinutesSimple(dateStr: string, timeStr: string, minutes: number): string {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  dt.setMinutes(dt.getMinutes() + minutes);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}`;
}
