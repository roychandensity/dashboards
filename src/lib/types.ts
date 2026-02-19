export interface ScheduleClass {
  id: string;
  spaceId: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" 24h or ""
  className: string;
  instructor: string;
  bufferBeforeOverride: number | null;
  bufferAfterOverride: number | null;
}
