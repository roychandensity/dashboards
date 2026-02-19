import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.SCHEDULE_DATA_DIR || path.join(process.cwd(), "data");

export interface StoredClass {
  studio: string;
  spaceId: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  className: string;
  instructor: string;
  bufferBefore: number;
  bufferAfter: number;
}

interface StoredScheduleFile {
  date: string;
  classes: StoredClass[];
  savedAt: string;
}

export async function saveSchedule(
  date: string,
  classes: StoredClass[]
): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `schedule-${date}.json`);
  const data: StoredScheduleFile = {
    date,
    classes,
    savedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function loadSchedule(date: string): Promise<StoredClass[]> {
  const filePath = path.join(DATA_DIR, `schedule-${date}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data: StoredScheduleFile = JSON.parse(raw);
    return data.classes || [];
  } catch {
    return [];
  }
}
