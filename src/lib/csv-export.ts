import type { MetricsBucket } from "./density-api";

const NZ_FORMATTER = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function toNZTimestamp(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return "";
  const parts = NZ_FORMATTER.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export interface ClassWindow {
  className: string;
  instructor: string;
  scheduledTime: string; // "HH:MM"
  startUtc: string;
  endUtc: string;
}

export interface CsvRow {
  timestamp: string;
  timestamp_nz: string;
  space_name: string;
  entrances: number;
  exits: number;
  occupancy_avg: number | null;
  occupancy_max: number | null;
  occupancy_min: number | null;
  class_name: string;
  instructor: string;
  scheduled_time: string;
}

const CSV_COLUMNS: (keyof CsvRow)[] = [
  "timestamp",
  "timestamp_nz",
  "space_name",
  "entrances",
  "exits",
  "occupancy_avg",
  "occupancy_max",
  "occupancy_min",
  "class_name",
  "instructor",
  "scheduled_time",
];

function findClassWindow(
  timestampUtc: string,
  classWindows: ClassWindow[]
): ClassWindow | undefined {
  const ts = new Date(timestampUtc).getTime();
  for (const w of classWindows) {
    const start = new Date(w.startUtc).getTime();
    const end = new Date(w.endUtc).getTime();
    if (ts >= start && ts < end) return w;
  }
  return undefined;
}

export function buildCsvRows(
  buckets: MetricsBucket[],
  spaceName: string,
  classWindows: ClassWindow[]
): CsvRow[] {
  return buckets.map((b) => {
    const matched = findClassWindow(b.timestamp, classWindows);
    return {
      timestamp: b.timestamp,
      timestamp_nz: toNZTimestamp(b.timestamp),
      space_name: spaceName,
      entrances: b.entrances,
      exits: b.exits,
      occupancy_avg: b.occupancy_avg,
      occupancy_max: b.occupancy_max,
      occupancy_min: b.occupancy_min,
      class_name: matched?.className ?? "",
      instructor: matched?.instructor ?? "",
      scheduled_time: matched?.scheduledTime ?? "",
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

export function rowsToCsvString(rows: CsvRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((col) => escapeCsvField(row[col])).join(",")
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
  scheduledTime: string
): string {
  const classWindow: ClassWindow = {
    className,
    instructor,
    scheduledTime,
    startUtc: data.length > 0 ? data[0].timestamp : "",
    endUtc: data.length > 0 ? data[data.length - 1].timestamp : "",
  };
  const rows = buildCsvRows(data, spaceName, [classWindow]);
  return rowsToCsvString(rows);
}
