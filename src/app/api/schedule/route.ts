import { NextRequest, NextResponse } from "next/server";
import { fetchSpaces } from "@/lib/density-api";
import { saveSchedule, StoredClass } from "@/lib/schedule-store";

interface ClassInput {
  studio: string;
  time: string;
  class_name?: string;
  instructor?: string;
  buffer_before?: number;
  buffer_after?: number;
}

interface ScheduleInput {
  date: string;
  classes: ClassInput[];
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SCHEDULE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ScheduleInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { date, classes } = body;
  if (!date || !classes?.length) {
    return NextResponse.json(
      { error: "date and classes are required" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  try {
    // Resolve studio names to spaceIds
    const spaces = await fetchSpaces();
    const spaceMap = new Map<string, string>();
    for (const s of spaces) {
      spaceMap.set(s.name.toLowerCase(), s.id);
    }

    const storedClasses: StoredClass[] = [];
    const errors: string[] = [];

    for (const cls of classes) {
      if (!cls.studio || !cls.time) {
        errors.push(`Missing studio or time for class: ${JSON.stringify(cls)}`);
        continue;
      }

      const spaceId = spaceMap.get(cls.studio.toLowerCase());
      if (!spaceId) {
        errors.push(`Studio "${cls.studio}" not found`);
        continue;
      }

      storedClasses.push({
        studio: cls.studio,
        spaceId,
        date,
        time: cls.time,
        className: cls.class_name ?? "",
        instructor: cls.instructor ?? "",
        bufferBefore: cls.buffer_before ?? 5,
        bufferAfter: cls.buffer_after ?? 5,
      });
    }

    await saveSchedule(date, storedClasses);

    return NextResponse.json({
      success: true,
      classCount: storedClasses.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Schedule save error:", error);
    return NextResponse.json(
      { error: "Failed to save schedule" },
      { status: 500 }
    );
  }
}
