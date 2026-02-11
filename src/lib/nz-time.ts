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
