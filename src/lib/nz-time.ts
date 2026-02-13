/** Format a Date as "YYYY-MM-DDTHH:MM" in Pacific/Auckland for datetime-local inputs */
export function toNZLocal(date: Date): string {
  return date
    .toLocaleString("sv-SE", { timeZone: "Pacific/Auckland" })
    .slice(0, 16)
    .replace(" ", "T");
}

/** Convert a "YYYY-MM-DDTHH:MM" NZ local string back to a UTC ISO string */
export function fromNZLocal(localStr: string): string {
  const utcMs = Date.parse(localStr + ":00Z");
  if (isNaN(utcMs)) return "";
  const nzStr = new Date(utcMs).toLocaleString("sv-SE", {
    timeZone: "Pacific/Auckland",
  });
  const nzMs = Date.parse(nzStr.replace(" ", "T") + "Z");
  return new Date(utcMs - (nzMs - utcMs)).toISOString();
}

/** Get today's date in Pacific/Auckland as "YYYY-MM-DD" */
export function getTodayNZ(): string {
  return new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Pacific/Auckland" });
}

/** Get current NZ time as "YYYY-MM-DDTHH:MM" */
export function getNowNZ(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Pacific/Auckland" })
    .slice(0, 16)
    .replace(" ", "T");
}

/** Add minutes to a date+time, clamping to the same day. Returns "YYYY-MM-DDTHH:MM". */
export function addMinutesNZ(dateStr: string, timeStr: string, minutes: number): string {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  dt.setMinutes(dt.getMinutes() + minutes);
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:00`);
  if (dt < dayStart) return `${dateStr}T00:00`;
  if (dt > dayEnd) return `${dateStr}T23:59`;
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}`;
}
