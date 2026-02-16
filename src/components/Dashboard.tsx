"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import SpaceList from "@/components/SpaceList";
import ClassRow from "@/components/ClassRow";
import ExportPanel from "@/components/ExportPanel";
import { DensitySpace } from "@/lib/density-api";
import { parseScheduleCsv } from "@/lib/parse-schedule-csv";
import { getTodayNZ } from "@/lib/nz-time";

interface ScheduleClass {
  id: string;
  spaceId: string;
  date: string;
  time: string;
  className: string;
  instructor: string;
  bufferBeforeOverride: number | null;
  bufferAfterOverride: number | null;
}

interface DashboardProps {
  spaces: DensitySpace[];
  doorwayHealth: Record<string, string>;
}

const STORAGE_KEY = "dashboard-schedule";

interface StoredSchedule {
  version: 1;
  schedule: ScheduleClass[];
  bufferBefore: number;
  bufferAfter: number;
  savedAt: string;
}

function loadStored(): StoredSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && Array.isArray(parsed.schedule)) {
      return parsed as StoredSchedule;
    }
  } catch {
    // Ignore corrupt data
  }
  return null;
}

function saveToStorage(
  sched: ScheduleClass[] | null,
  before: number,
  after: number
) {
  if (typeof window === "undefined") return;
  if (sched && sched.length > 0) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        schedule: sched,
        bufferBefore: before,
        bufferAfter: after,
        savedAt: new Date().toISOString(),
      } satisfies StoredSchedule)
    );
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

let nextId = 1;

export default function Dashboard({ spaces, doorwayHealth }: DashboardProps) {
  const [schedule, setSchedule] = useState<ScheduleClass[] | null>(null);
  const [bufferBefore, setBufferBefore] = useState(5);
  const [bufferAfter, setBufferAfter] = useState(5);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs so handlers always read the latest values without stale closures
  const bufferBeforeRef = useRef(bufferBefore);
  bufferBeforeRef.current = bufferBefore;
  const bufferAfterRef = useRef(bufferAfter);
  bufferAfterRef.current = bufferAfter;

  // Load from localStorage on mount (client-side only)
  useEffect(() => {
    const stored = loadStored();
    if (stored && stored.schedule.length > 0) {
      const maxId = stored.schedule.reduce(
        (max, c) => Math.max(max, parseInt(c.id) || 0),
        0
      );
      nextId = maxId + 1;
      setSchedule(stored.schedule);
      setBufferBefore(stored.bufferBefore);
      setBufferAfter(stored.bufferAfter);
    }
  }, []);

  // Precompute doorwayIds by spaceId
  const doorwayIdsBySpace = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of spaces) {
      map.set(s.id, s.doorways.map((d) => d.id));
    }
    return map;
  }, [spaces]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const { classes, errors } = parseScheduleCsv(text);

        const spaceMap = new Map<string, DensitySpace>();
        for (const s of spaces) {
          spaceMap.set(s.name.toLowerCase(), s);
        }

        const newErrors = [...errors];
        const newSchedule: ScheduleClass[] = [];

        for (const cls of classes) {
          const space = spaceMap.get(cls.studioName.toLowerCase());
          if (!space) {
            newErrors.push(
              `Studio "${cls.studioName}" not found in available spaces`
            );
            continue;
          }
          newSchedule.push({
            id: String(nextId++),
            spaceId: space.id,
            date: cls.date,
            time: cls.time,
            className: cls.className,
            instructor: cls.instructor,
            bufferBeforeOverride: cls.bufferBefore,
            bufferAfterOverride: cls.bufferAfter,
          });
        }

        const result = newSchedule.length > 0 ? newSchedule : null;
        setSchedule(result);
        setUploadErrors(newErrors);
        saveToStorage(result, bufferBeforeRef.current, bufferAfterRef.current);
      };
      reader.readAsText(file);

      // Reset input so the same file can be re-uploaded
      e.target.value = "";
    },
    [spaces]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClear = useCallback(() => {
    setSchedule(null);
    setUploadErrors([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    const today = getTodayNZ();
    const [y, m, d] = today.split("-");
    const ddmmyyyy = `${d}/${m}/${y}`;

    const header = "studio,date,time,class_name,instructor,buffer_before,buffer_after";
    const rows = spaces.map(
      (s) => `${s.name},${ddmmyyyy},,,,, `
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-template-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [spaces]);

  const updateClassTime = useCallback((id: string, time: string) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => (c.id === id ? { ...c, time } : c));
      saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current);
      return next;
    });
  }, []);

  const updateClassBuffers = useCallback(
    (id: string, before: number | null, after: number | null) => {
      setSchedule((prev) => {
        if (!prev) return prev;
        const next = prev.map((c) =>
          c.id === id
            ? { ...c, bufferBeforeOverride: before, bufferAfterOverride: after }
            : c
        );
        saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current);
        return next;
      });
    },
    []
  );

  const removeClass = useCallback((id: string) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current);
      return next;
    });
  }, []);

  const handleBufferBeforeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      setBufferBefore(val);
      bufferBeforeRef.current = val;
      // Re-save with the updated buffer — read schedule from ref-less source
      setSchedule((prev) => {
        if (prev && prev.length > 0) {
          saveToStorage(prev, val, bufferAfterRef.current);
        }
        return prev; // no state change, just piggyback to read current schedule
      });
    },
    []
  );

  const handleBufferAfterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      setBufferAfter(val);
      bufferAfterRef.current = val;
      setSchedule((prev) => {
        if (prev && prev.length > 0) {
          saveToStorage(prev, bufferBeforeRef.current, val);
        }
        return prev;
      });
    },
    []
  );

  // Group schedule by spaceId, preserving order
  const groupedSchedule = schedule
    ? (() => {
        const groups: { space: DensitySpace; classes: ScheduleClass[] }[] = [];
        const spaceIdToGroup = new Map<string, number>();
        const spaceById = new Map(spaces.map((s) => [s.id, s]));

        for (const cls of schedule) {
          const idx = spaceIdToGroup.get(cls.spaceId);
          if (idx !== undefined) {
            groups[idx].classes.push(cls);
          } else {
            const space = spaceById.get(cls.spaceId);
            if (space) {
              spaceIdToGroup.set(cls.spaceId, groups.length);
              groups.push({ space, classes: [cls] });
            }
          }
        }
        return groups;
      })()
    : null;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      {!schedule ? (
        /* ── Tile mode ── */
        <>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleUploadClick}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Upload Schedule
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Download Template
            </button>
          </div>

          {uploadErrors.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 mb-1">
                Upload errors:
              </p>
              <ul className="text-sm text-red-600 list-disc list-inside space-y-0.5">
                {uploadErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <SpaceList spaces={spaces} doorwayHealth={doorwayHealth} />
        </>
      ) : (
        /* ── Dashboard mode ── */
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              onClick={handleUploadClick}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Upload New
            </button>
            <button
              onClick={() => setShowExportPanel((v) => !v)}
              className={`text-sm font-medium px-4 py-2 rounded-lg border ${
                showExportPanel
                  ? "bg-green-50 text-green-700 border-green-300"
                  : "text-gray-600 hover:text-gray-800 border-gray-300"
              }`}
            >
              Export All CSV
            </button>
            <button
              onClick={handleClear}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 px-4 py-2 rounded-lg"
            >
              Clear Schedule
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <label className="flex items-center gap-1 text-sm text-gray-700">
                Buffer:
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={bufferBefore}
                  onChange={handleBufferBeforeChange}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16"
                />
                <span className="text-xs text-gray-500">min before</span>
              </label>
              <label className="flex items-center gap-1 text-sm text-gray-700">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={bufferAfter}
                  onChange={handleBufferAfterChange}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16"
                />
                <span className="text-xs text-gray-500">min after</span>
              </label>
            </div>
          </div>

          {uploadErrors.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 mb-1">
                Upload errors:
              </p>
              <ul className="text-sm text-red-600 list-disc list-inside space-y-0.5">
                {uploadErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {showExportPanel && schedule && (
            <ExportPanel
              spaces={spaces}
              schedule={schedule}
              bufferBefore={bufferBefore}
              bufferAfter={bufferAfter}
            />
          )}

          {groupedSchedule?.map(({ space, classes: spaceClasses }) => (
            <div key={space.id} className="mb-8">
              <Link
                href={`/space/${space.id}`}
                className="text-lg font-semibold text-gray-900 hover:text-blue-600 hover:underline mb-3 inline-block"
              >
                {space.name}
              </Link>
              <div className="space-y-4">
                {spaceClasses.map((cls) => (
                  <ClassRow
                    key={cls.id}
                    spaceId={cls.spaceId}
                    spaceName={space.name}
                    date={cls.date}
                    time={cls.time}
                    globalBufferBefore={bufferBefore}
                    globalBufferAfter={bufferAfter}
                    bufferBeforeOverride={cls.bufferBeforeOverride}
                    bufferAfterOverride={cls.bufferAfterOverride}
                    className={cls.className}
                    instructor={cls.instructor}
                    doorwayIds={doorwayIdsBySpace.get(cls.spaceId) ?? []}
                    onTimeChange={(t) => updateClassTime(cls.id, t)}
                    onBufferOverrideChange={(before, after) =>
                      updateClassBuffers(cls.id, before, after)
                    }
                    onRemove={() => removeClass(cls.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
