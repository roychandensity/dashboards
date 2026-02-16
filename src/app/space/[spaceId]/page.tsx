"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import ClassRow from "@/components/ClassRow";
import { getTodayNZ } from "@/lib/nz-time";

interface SpaceData {
  id: string;
  name: string;
  capacity: number | null;
  doorways: { id: string; name: string }[];
}

interface ClassSlot {
  id: string;
  time: string; // "HH:MM" or ""
  bufferBeforeOverride: number | null;
  bufferAfterOverride: number | null;
}

let nextId = 1;
function makeSlot(time = ""): ClassSlot {
  return { id: String(nextId++), time, bufferBeforeOverride: null, bufferAfterOverride: null };
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" */
function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** "DD/MM/YYYY" → "YYYY-MM-DD" or "" if invalid */
function fromDisplayDate(display: string): string {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, d, m, y] = match;
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  if (isNaN(date.getTime())) return "";
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SpaceDetailPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = use(params);
  const [space, setSpace] = useState<SpaceData | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/spaces")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load spaces");
        return res.json();
      })
      .then(({ spaces }) => {
        const found = spaces.find((s: SpaceData) => s.id === spaceId);
        if (found) {
          setSpace(found);
        } else {
          setSpaceError("Space not found");
        }
      })
      .catch((err) => setSpaceError(err.message));
  }, [spaceId]);

  const [selectedDate, setSelectedDate] = useState(() => getTodayNZ());
  const [dateText, setDateText] = useState(() => toDisplayDate(getTodayNZ()));
  const dateError = useMemo(() => {
    if (!dateText) return null;
    return fromDisplayDate(dateText) ? null : "Use dd/mm/yyyy format";
  }, [dateText]);

  const handleDateTextChange = useCallback((value: string) => {
    setDateText(value);
    const parsed = fromDisplayDate(value);
    if (parsed) setSelectedDate(parsed);
  }, []);

  const [bufferBefore, setBufferBefore] = useState(5);
  const [bufferAfter, setBufferAfter] = useState(5);
  const [classes, setClasses] = useState<ClassSlot[]>(() => [makeSlot()]);

  const addClass = useCallback(() => {
    setClasses((prev) => [...prev, makeSlot()]);
  }, []);

  const removeClass = useCallback((id: string) => {
    setClasses((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length === 0 ? [makeSlot()] : next;
    });
  }, []);

  const updateClassTime = useCallback((id: string, time: string) => {
    setClasses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, time } : c))
    );
  }, []);

  const updateClassBuffers = useCallback(
    (id: string, before: number | null, after: number | null) => {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, bufferBeforeOverride: before, bufferAfterOverride: after }
            : c
        )
      );
    },
    []
  );

  if (spaceError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-red-500">{spaceError}</p>
        <Link
          href="/"
          className="text-blue-600 hover:underline text-sm mt-2 inline-block"
        >
          Back to spaces
        </Link>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse text-gray-400">Loading space...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-blue-600 hover:underline mb-2 inline-block"
        >
          &larr; All Spaces
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{space.name}</h1>
        {space.capacity && (
          <p className="text-sm text-gray-500">
            Capacity: {space.capacity}
          </p>
        )}
        {space.doorways.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {space.doorways.map((d) => (
              <p key={d.id} className="text-xs text-gray-400">
                {d.name} <span className="text-gray-300">{d.id}</span>
              </p>
            ))}
          </div>
        )}
      </header>

      <div className="space-y-6">
        {/* Controls */}
        <div className="bg-white rounded-xl shadow-md p-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm font-medium text-gray-700">
            Date
            <input
              type="text"
              placeholder="dd/mm/yyyy"
              value={dateText}
              onChange={(e) => handleDateTextChange(e.target.value)}
              className={`mt-1 border rounded-md px-2 py-1 text-sm w-32 ${dateError ? "border-red-400" : "border-gray-300"}`}
            />
            {dateError && (
              <span className="text-xs text-red-500 mt-0.5">{dateError}</span>
            )}
          </label>

          <label className="flex flex-col text-sm font-medium text-gray-700">
            Buffer before
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                min={0}
                max={60}
                value={bufferBefore}
                onChange={(e) =>
                  setBufferBefore(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16"
              />
              <span className="text-xs text-gray-500">min</span>
            </div>
          </label>

          <label className="flex flex-col text-sm font-medium text-gray-700">
            Buffer after
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                min={0}
                max={60}
                value={bufferAfter}
                onChange={(e) =>
                  setBufferAfter(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16"
              />
              <span className="text-xs text-gray-500">min</span>
            </div>
          </label>

          <button
            onClick={addClass}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-blue-700"
          >
            + Add Class
          </button>
        </div>

        {/* Class rows */}
        {classes.map((cls) => (
          <ClassRow
            key={cls.id}
            spaceId={spaceId}
            spaceName={space.name}
            date={selectedDate}
            time={cls.time}
            globalBufferBefore={bufferBefore}
            globalBufferAfter={bufferAfter}
            bufferBeforeOverride={cls.bufferBeforeOverride}
            bufferAfterOverride={cls.bufferAfterOverride}
            onTimeChange={(t) => updateClassTime(cls.id, t)}
            onBufferOverrideChange={(before, after) =>
              updateClassBuffers(cls.id, before, after)
            }
            onRemove={() => removeClass(cls.id)}
          />
        ))}
      </div>
    </div>
  );
}
