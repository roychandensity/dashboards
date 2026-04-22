"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import SpaceList from "@/components/SpaceList";
import ClassGroupWrapper from "@/components/ClassGroupWrapper";
import ExportPanel from "@/components/ExportPanel";
import { detectBackToBack } from "@/lib/back-to-back";
import { DensitySpace } from "@/lib/density-api";
import { parseScheduleCsv } from "@/lib/parse-schedule-csv";
import { read, utils } from "xlsx";
import { getTodayNZ, fromNZLocal } from "@/lib/nz-time";
import type { ScheduleClass } from "@/lib/types";

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
  countAtOffset: number;
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
  after: number,
  offset: number
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
        countAtOffset: offset,
        savedAt: new Date().toISOString(),
      } satisfies StoredSchedule)
    );
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** "2026-02-09" → "Sunday, 9 Feb 2026" */
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Add minutes to "HH:MM" time string, returning "HH:MM" */
function addMinutesLocal(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

let nextId = 1;

export default function Dashboard({ spaces, doorwayHealth }: DashboardProps) {
  const [schedule, setSchedule] = useState<ScheduleClass[] | null>(null);
  const [bufferBefore, setBufferBefore] = useState(5);
  const [bufferAfter, setBufferAfter] = useState(10);
  const [countAtOffset, setCountAtOffset] = useState(10);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedSpaces, setSelectedSpaces] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSpaceId, setAddSpaceId] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addClassName, setAddClassName] = useState("");
  const [addInstructor, setAddInstructor] = useState("");

  // Refs so handlers always read the latest values without stale closures
  const bufferBeforeRef = useRef(bufferBefore);
  bufferBeforeRef.current = bufferBefore;
  const bufferAfterRef = useRef(bufferAfter);
  bufferAfterRef.current = bufferAfter;
  const countAtOffsetRef = useRef(countAtOffset);
  countAtOffsetRef.current = countAtOffset;

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
      if (typeof stored.countAtOffset === "number") {
        setCountAtOffset(stored.countAtOffset);
      }
      // Default filter to first studio
      const firstSpaceId = stored.schedule[0]?.spaceId;
      if (firstSpaceId) setSelectedSpaces(new Set([firstSpaceId]));
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

  const processScheduleText = useCallback(
    (csvText: string) => {
      const { classes, errors } = parseScheduleCsv(csvText);

      // Build two lookup maps: exact (lowercase) and normalized (no spaces)
      const spaceMap = new Map<string, DensitySpace>();
      const spaceMapNorm = new Map<string, DensitySpace>();
      const DIGITS_TO_WORDS: Record<string, string> = {
        "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
        "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
      };
      const normalize = (s: string) =>
        s.toLowerCase()
          .replace(/\d+/g, (d) => DIGITS_TO_WORDS[d] ?? d)
          .replace(/\s+/g, "");
      for (const s of spaces) {
        spaceMap.set(s.name.toLowerCase(), s);
        spaceMapNorm.set(normalize(s.name), s);
      }

      const newErrors = [...errors];
      const newSchedule: ScheduleClass[] = [];

      for (const cls of classes) {
        const space = spaceMap.get(cls.studioName.toLowerCase())
          ?? spaceMapNorm.get(normalize(cls.studioName));
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
      saveToStorage(result, bufferBeforeRef.current, bufferAfterRef.current, countAtOffsetRef.current);

      if (result) {
        const firstSpaceId = result[0]?.spaceId;
        if (firstSpaceId) setSelectedSpaces(new Set([firstSpaceId]));
      }
    },
    [spaces]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

      if (isXlsx) {
        const reader = new FileReader();
        reader.onload = () => {
          const data = new Uint8Array(reader.result as ArrayBuffer);
          const workbook = read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const csvText = utils.sheet_to_csv(sheet);
          processScheduleText(csvText);
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          processScheduleText(reader.result as string);
        };
        reader.readAsText(file);
      }

      // Reset input so the same file can be re-uploaded
      e.target.value = "";
    },
    [processScheduleText]
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
    const header = "ClubName,StudioName,clubstudio,ClassName,LongClassName,StartDate,StartTime,Time,CRMAttended,DeviceProviderCount,ManualCount,MainInstructorName,Class Count";

    const blob = new Blob([header], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-template-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const updateClassTime = useCallback((id: string, time: string) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      const next = prev.map((c) => (c.id === id ? { ...c, time } : c));
      saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current, countAtOffsetRef.current);
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
        saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current, countAtOffsetRef.current);
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
      saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current, countAtOffsetRef.current);
      return next;
    });
  }, []);

  const handleAddClass = useCallback(() => {
    if (!addSpaceId || !addDate || !addClassName) return;
    const newClass: ScheduleClass = {
      id: String(nextId++),
      spaceId: addSpaceId,
      date: addDate,
      time: addTime,
      className: addClassName,
      instructor: addInstructor,
      bufferBeforeOverride: null,
      bufferAfterOverride: null,
    };
    setSchedule((prev) => {
      const next = prev ? [...prev, newClass] : [newClass];
      saveToStorage(next, bufferBeforeRef.current, bufferAfterRef.current, countAtOffsetRef.current);
      return next;
    });
    // Reset form but keep it open for adding more
    setAddTime("");
    setAddClassName("");
    setAddInstructor("");
  }, [addSpaceId, addDate, addTime, addClassName, addInstructor]);

  const handleBufferBeforeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      setBufferBefore(val);
      bufferBeforeRef.current = val;
      // Re-save with the updated buffer — read schedule from ref-less source
      setSchedule((prev) => {
        if (prev && prev.length > 0) {
          saveToStorage(prev, val, bufferAfterRef.current, countAtOffsetRef.current);
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
          saveToStorage(prev, bufferBeforeRef.current, val, countAtOffsetRef.current);
        }
        return prev;
      });
    },
    []
  );

  const handleCountAtOffsetChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(0, parseInt(e.target.value) || 0);
      setCountAtOffset(val);
      countAtOffsetRef.current = val;
      setSchedule((prev) => {
        if (prev && prev.length > 0) {
          saveToStorage(prev, bufferBeforeRef.current, bufferAfterRef.current, val);
        }
        return prev;
      });
    },
    []
  );

  const handleExportAll = useCallback(async () => {
    if (!schedule || schedule.length === 0) return;

    // Compute date range from entire schedule (with buffers)
    let earliest: Date | null = null;
    let latest: Date | null = null;
    for (const cls of schedule) {
      if (!cls.time) continue;
      const before = cls.bufferBeforeOverride ?? bufferBeforeRef.current;
      const after = cls.bufferAfterOverride ?? bufferAfterRef.current;
      const startUtc = fromNZLocal(`${cls.date}T${addMinutesLocal(cls.time, -before)}`);
      const endUtc = fromNZLocal(`${cls.date}T${addMinutesLocal(cls.time, after)}`);
      if (!startUtc || !endUtc) continue;
      const s = new Date(startUtc);
      const e = new Date(endUtc);
      if (!earliest || s < earliest) earliest = s;
      if (!latest || e > latest) latest = e;
    }

    if (!earliest || !latest) return;

    const spaceById = new Map(spaces.map((s) => [s.id, s]));
    const spaceIds = [...new Set(schedule.map((c) => c.spaceId))];
    const spacesPayload = spaceIds
      .map((id) => {
        const s = spaceById.get(id);
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
        bufferBefore: c.bufferBeforeOverride ?? bufferBeforeRef.current,
        bufferAfter: c.bufferAfterOverride ?? bufferAfterRef.current,
      }));

    setExportLoading(true);
    setExportError(null);

    try {
      const res = await fetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaces: spacesPayload,
          startDate: earliest.toISOString(),
          endDate: latest.toISOString(),
          classes: classesPayload,
          countAtOffset: countAtOffsetRef.current,
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
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  }, [schedule, spaces]);

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
        accept=".csv,.xlsx,.xls"
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
              onClick={handleExportAll}
              disabled={exportLoading}
              className="text-sm font-medium px-4 py-2 rounded-lg border bg-green-600 text-white border-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed"
            >
              {exportLoading ? "Exporting..." : "Export All CSV"}
            </button>
            <button
              onClick={() => setShowExportPanel((v) => !v)}
              className={`text-sm font-medium px-4 py-2 rounded-lg border ${
                showExportPanel
                  ? "bg-green-50 text-green-700 border-green-300"
                  : "text-gray-600 hover:text-gray-800 border-gray-300"
              }`}
            >
              Custom Range
            </button>
            <button
              onClick={handleClear}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 px-4 py-2 rounded-lg"
            >
              Clear Schedule
            </button>
            <button
              onClick={() => {
                setShowAddForm((v) => !v);
                if (!addDate) setAddDate(getTodayNZ());
                if (!addSpaceId && spaces.length > 0) setAddSpaceId(spaces[0].id);
              }}
              className={`text-sm font-medium px-4 py-2 rounded-lg border ${
                showAddForm
                  ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                  : "text-gray-600 hover:text-gray-800 border-gray-300"
              }`}
            >
              {showAddForm ? "Hide Form" : "Add Class"}
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
              <span className="text-gray-300 mx-1">|</span>
              <label className="flex items-center gap-1 text-sm text-gray-700">
                Count at
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={countAtOffset}
                  onChange={handleCountAtOffsetChange}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm w-16"
                />
                <span className="text-xs text-gray-500">min after start</span>
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

          {exportLoading && (
            <p className="mb-4 text-sm text-gray-500 animate-pulse">
              Fetching data for all classes. This may take a moment...
            </p>
          )}

          {exportError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{exportError}</p>
            </div>
          )}

          {showAddForm && (
            <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-sm text-gray-700">
                  Space
                  <select
                    value={addSpaceId}
                    onChange={(e) => setAddSpaceId(e.target.value)}
                    className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  >
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col text-sm text-gray-700">
                  Date
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col text-sm text-gray-700">
                  Time
                  <input
                    type="time"
                    value={addTime}
                    onChange={(e) => setAddTime(e.target.value)}
                    className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col text-sm text-gray-700">
                  Class Name
                  <input
                    type="text"
                    value={addClassName}
                    onChange={(e) => setAddClassName(e.target.value)}
                    placeholder="e.g. Spin"
                    className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm w-36"
                  />
                </label>
                <label className="flex flex-col text-sm text-gray-700">
                  Instructor
                  <input
                    type="text"
                    value={addInstructor}
                    onChange={(e) => setAddInstructor(e.target.value)}
                    placeholder="Optional"
                    className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm w-36"
                  />
                </label>
                <button
                  onClick={handleAddClass}
                  disabled={!addSpaceId || !addDate || !addClassName}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {showExportPanel && schedule && (
            <ExportPanel
              spaces={spaces}
              schedule={schedule}
              bufferBefore={bufferBefore}
              bufferAfter={bufferAfter}
              countAtOffset={countAtOffset}
            />
          )}

          {groupedSchedule && groupedSchedule.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSelectedSpaces(new Set())}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  selectedSpaces.size === 0
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                All
              </button>
              {groupedSchedule.map(({ space }) => {
                const active = selectedSpaces.has(space.id);
                return (
                  <button
                    key={space.id}
                    onClick={() =>
                      setSelectedSpaces((prev) => {
                        const next = new Set(prev);
                        if (next.has(space.id)) next.delete(space.id);
                        else next.add(space.id);
                        return next;
                      })
                    }
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "text-gray-600 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {space.name}
                  </button>
                );
              })}
            </div>
          )}

          {groupedSchedule
            ?.filter(({ space }) => selectedSpaces.size === 0 || selectedSpaces.has(space.id))
            .map(({ space, classes: spaceClasses }) => {
            const groups = detectBackToBack(spaceClasses, bufferBefore, bufferAfter);
            return (
              <div key={space.id} className="mb-8">
                <Link
                  href={`/space/${space.id}`}
                  className="text-lg font-semibold text-gray-900 hover:text-blue-600 hover:underline mb-3 inline-block"
                >
                  {space.name}
                </Link>
                <div className="space-y-4">
                  {groups.map((group, gi) => {
                    const groupDate = group.classes[0]?.date;
                    const prevDate = gi > 0 ? groups[gi - 1].classes[0]?.date : null;
                    const showDateDivider = gi === 0 || groupDate !== prevDate;
                    return (
                      <div key={group.classes.map((c) => c.id).join("-")}>
                        {showDateDivider && (
                          <div className="flex items-center gap-3 pt-2 pb-1">
                            <div className="h-px flex-1 bg-gray-200" />
                            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                              {formatDateLabel(groupDate)}
                            </span>
                            <div className="h-px flex-1 bg-gray-200" />
                          </div>
                        )}
                        <ClassGroupWrapper
                          group={group}
                          spaceId={space.id}
                          spaceName={space.name}
                          doorwayIds={doorwayIdsBySpace.get(space.id) ?? []}
                          globalBufferBefore={bufferBefore}
                          globalBufferAfter={bufferAfter}
                          countAtOffset={countAtOffset}
                          onTimeChange={(id, t) => updateClassTime(id, t)}
                          onBufferOverrideChange={(id, before, after) =>
                            updateClassBuffers(id, before, after)
                          }
                          onRemove={(id) => removeClass(id)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
