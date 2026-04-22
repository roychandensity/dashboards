export interface ParsedClass {
  studioName: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" 24h
  className: string;
  instructor: string;
  bufferBefore: number | null;
  bufferAfter: number | null;
}

export interface ParseResult {
  classes: ParsedClass[];
  errors: string[];
}

/** "11/02/2026" (dd/mm/yyyy) → "2026-02-11" */
function parseDdMmYyyy(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dStr, mStr, yStr] = match;
  const d = parseInt(dStr, 10);
  const m = parseInt(mStr, 10);
  const y = parseInt(yStr, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "9-Feb-26" (D-Mon-YY) → "2026-02-09" */
function parseDdMonYy(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!match) return null;
  const d = parseInt(match[1], 10);
  const m = MONTH_ABBR[match[2].toLowerCase()];
  const yy = parseInt(match[3], 10);
  if (!m || d < 1 || d > 31) return null;
  const y = 2000 + yy;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Try all supported date formats */
function parseDate(raw: string): string | null {
  return parseDdMmYyyy(raw) ?? parseDdMonYy(raw);
}

/** "5:30 AM" or "5:30:00 AM" → "05:30", handles 12 AM/PM edge cases */
function parseAmPmTime(raw: string): string | null {
  const match = raw
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (h < 1 || h > 12 || m < 0 || m > 59) return null;

  if (period === "AM") {
    if (h === 12) h = 0; // 12:xx AM → 00:xx
  } else {
    if (h !== 12) h += 12; // 1-11 PM → 13-23; 12 PM stays 12
  }

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseScheduleCsv(csvText: string): ParseResult {
  const classes: ParsedClass[] = [];
  const errors: string[] = [];

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    errors.push("CSV is empty");
    return { classes, errors };
  }

  // Parse header to find column indices
  const headerCells = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, ""));
  const colMap: Record<string, number> = {};
  for (let i = 0; i < headerCells.length; i++) {
    colMap[headerCells[i]] = i;
  }

  // Les Mills CSV: clubstudio is primary, fallback to clubname+studioname or plain studio
  const clubStudioIdx = colMap["clubstudio"] ?? -1;
  const clubNameIdx = colMap["clubname"] ?? -1;
  const studioNameIdx = colMap["studioname"] ?? -1;
  const plainStudioIdx = colMap["studio"] ?? -1;
  const studioIdx = clubStudioIdx !== -1 ? clubStudioIdx
    : plainStudioIdx !== -1 ? plainStudioIdx
    : studioNameIdx; // fallback to StudioName alone
  const hasStudioFallback = clubNameIdx !== -1 && studioNameIdx !== -1;

  const dateIdx = colMap["startdate"] ?? colMap["date"] ?? -1;
  const timeIdx = colMap["starttime"] ?? colMap["time"] ?? -1;
  const classNameIdx = colMap["classname"] ?? colMap["class"] ?? -1;
  const instructorIdx = colMap["maininstructorname"] ?? colMap["instructor"] ?? -1;
  const bufferBeforeIdx = colMap["bufferbefore"] ?? -1;
  const bufferAfterIdx = colMap["bufferafter"] ?? -1;

  if (studioIdx === -1 && !hasStudioFallback) {
    errors.push("Missing required column: studio (or clubstudio, or clubname+studioname)");
  }
  if (dateIdx === -1) {
    errors.push("Missing required column: date (or startdate)");
  }
  if (timeIdx === -1) {
    errors.push("Missing required column: time (or starttime)");
  }
  if ((studioIdx === -1 && !hasStudioFallback) || dateIdx === -1 || timeIdx === -1) {
    return { classes, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const rowNum = i + 1;

    // Resolve studio name: clubstudio > clubname+studioname > studioname > studio
    let studioName = studioIdx !== -1 ? (cells[studioIdx] || "") : "";
    if (!studioName && hasStudioFallback) {
      const club = cells[clubNameIdx] || "";
      const studio = cells[studioNameIdx] || "";
      studioName = club + studio;
    }
    if (!studioName) {
      errors.push(`Row ${rowNum}: missing studio name`);
      continue;
    }

    const rawDate = cells[dateIdx] || "";
    const date = parseDate(rawDate);
    if (!date) {
      errors.push(`Row ${rowNum}: invalid date "${rawDate}" (expected dd/mm/yyyy or d-Mon-yy)`);
      continue;
    }

    const rawTime = cells[timeIdx] || "";
    const time = parseAmPmTime(rawTime);
    if (!time) {
      errors.push(`Row ${rowNum}: invalid time "${rawTime}" (expected h:mm AM/PM)`);
      continue;
    }

    const className = classNameIdx >= 0 ? (cells[classNameIdx] || "") : "";
    const instructor = instructorIdx >= 0 ? (cells[instructorIdx] || "") : "";

    let bufferBefore: number | null = null;
    if (bufferBeforeIdx >= 0 && cells[bufferBeforeIdx]) {
      const n = parseInt(cells[bufferBeforeIdx], 10);
      if (isNaN(n) || n < 0) {
        errors.push(`Row ${rowNum}: invalid buffer_before "${cells[bufferBeforeIdx]}"`);
        continue;
      }
      bufferBefore = n;
    }

    let bufferAfter: number | null = null;
    if (bufferAfterIdx >= 0 && cells[bufferAfterIdx]) {
      const n = parseInt(cells[bufferAfterIdx], 10);
      if (isNaN(n) || n < 0) {
        errors.push(`Row ${rowNum}: invalid buffer_after "${cells[bufferAfterIdx]}"`);
        continue;
      }
      bufferAfter = n;
    }

    classes.push({
      studioName,
      date,
      time,
      className,
      instructor,
      bufferBefore,
      bufferAfter,
    });
  }

  return { classes, errors };
}
