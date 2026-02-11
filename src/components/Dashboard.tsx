"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import SpaceList from "@/components/SpaceList";
import ClassRow from "@/components/ClassRow";
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

let nextId = 1;

export default function Dashboard({ spaces, doorwayHealth }: DashboardProps) {
  const [schedule, setSchedule] = useState<ScheduleClass[] | null>(null);
  const [bufferBefore, setBufferBefore] = useState(5);
  const [bufferAfter, setBufferAfter] = useState(5);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        setSchedule(newSchedule.length > 0 ? newSchedule : null);
        setUploadErrors(newErrors);
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
    setSchedule((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, time } : c)) : prev
    );
  }, []);

  const updateClassBuffers = useCallback(
    (id: string, before: number | null, after: number | null) => {
      setSchedule((prev) =>
        prev
          ? prev.map((c) =>
              c.id === id
                ? { ...c, bufferBeforeOverride: before, bufferAfterOverride: after }
                : c
            )
          : prev
      );
    },
    []
  );

  const removeClass = useCallback((id: string) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      const next = prev.filter((c) => c.id !== id);
      return next.length === 0 ? null : next;
    });
  }, []);

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
                  onChange={(e) =>
                    setBufferBefore(Math.max(0, parseInt(e.target.value) || 0))
                  }
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
                  onChange={(e) =>
                    setBufferAfter(Math.max(0, parseInt(e.target.value) || 0))
                  }
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
                    date={cls.date}
                    time={cls.time}
                    globalBufferBefore={bufferBefore}
                    globalBufferAfter={bufferAfter}
                    bufferBeforeOverride={cls.bufferBeforeOverride}
                    bufferAfterOverride={cls.bufferAfterOverride}
                    className={cls.className}
                    instructor={cls.instructor}
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
