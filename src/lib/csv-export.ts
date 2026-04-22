import type { MetricsBucket } from "./density-api";
import { findCountAtOffset } from "./count-at-offset";

export interface ClassWindowExtended {
  className: string;
  instructor: string;
  scheduledTime: string; // "HH:MM"
  date: string; // "YYYY-MM-DD"
  startUtc: string;
  endUtc: string;
  countAtOffsetMinutes: number;
  classStartUtc: string;
  bufferBefore: number;
  bufferAfter: number;
}

export interface SummaryCsvRow {
  date: string;
  time: string;
  studio: string;
  class_name: string;
  instructor: string;
  buffer_before: number;
  buffer_after: number;
  entrances: number;
  exits: number;
  net_occupancy: number;
  count_at_offset: number | null;
  count_at_offset_minutes: number;
}

const SUMMARY_COLUMNS: (keyof SummaryCsvRow)[] = [
  "date",
  "time",
  "studio",
  "class_name",
  "instructor",
  "buffer_before",
  "buffer_after",
  "entrances",
  "exits",
  "net_occupancy",
  "count_at_offset",
  "count_at_offset_minutes",
];

/**
 * Build one summary row per class window by aggregating all minute-level
 * buckets that fall within that window.
 */
export function buildSummaryRows(
  buckets: MetricsBucket[],
  spaceName: string,
  classWindows: ClassWindowExtended[]
): SummaryCsvRow[] {
  return classWindows.map((w) => {
    const startMs = new Date(w.startUtc).getTime();
    const endMs = new Date(w.endUtc).getTime();
    const windowBuckets = buckets.filter((b) => {
      const ts = new Date(b.timestamp).getTime();
      return ts >= startMs && ts < endMs;
    });

    let entrances = 0;
    let exits = 0;
    for (const b of windowBuckets) {
      entrances += b.entrances;
      exits += b.exits;
    }

    let countAtOffsetValue: number | null = null;
    if (w.classStartUtc) {
      const { count } = findCountAtOffset(windowBuckets, w.classStartUtc, w.countAtOffsetMinutes);
      countAtOffsetValue = count;
    }

    return {
      date: w.date,
      time: w.scheduledTime,
      studio: spaceName,
      class_name: w.className,
      instructor: w.instructor,
      buffer_before: w.bufferBefore,
      buffer_after: w.bufferAfter,
      entrances,
      exits,
      net_occupancy: entrances - exits,
      count_at_offset: countAtOffsetValue,
      count_at_offset_minutes: w.countAtOffsetMinutes,
    };
  });
}

function escapeCsvField(value: string | number | null): string {
  if (value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function summaryRowsToCsvString(rows: SummaryCsvRow[]): string {
  const header = SUMMARY_COLUMNS.join(",");
  const lines = rows.map((row) =>
    SUMMARY_COLUMNS.map((col) => escapeCsvField(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}

export function triggerDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateClassExportCsv(
  data: MetricsBucket[],
  spaceName: string,
  className: string,
  instructor: string,
  date: string,
  scheduledTime: string,
  bufferBefore: number,
  bufferAfter: number,
  countAtOffsetMinutes: number = 10,
  classStartUtc?: string
): string {
  const classWindow: ClassWindowExtended = {
    className,
    instructor,
    scheduledTime,
    date,
    startUtc: data.length > 0 ? data[0].timestamp : "",
    endUtc: data.length > 0 ? data[data.length - 1].timestamp : "",
    countAtOffsetMinutes,
    classStartUtc: classStartUtc ?? "",
    bufferBefore,
    bufferAfter,
  };
  const rows = buildSummaryRows(data, spaceName, [classWindow]);
  return summaryRowsToCsvString(rows);
}
