import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";
import { fetchHistoricalMetrics1m } from "@/lib/density-api";
import { buildCsvRows, rowsToCsvString, ClassWindowExtended, CsvRow } from "@/lib/csv-export";
import { fromNZLocal } from "@/lib/nz-time";

interface SpaceInput {
  spaceId: string;
  spaceName: string;
}

interface ClassInput {
  spaceId: string;
  className: string;
  instructor: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  bufferBefore: number;
  bufferAfter: number;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    spaces: SpaceInput[];
    startDate: string;
    endDate: string;
    classes: ClassInput[];
    countAtOffset?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { spaces, startDate, endDate, classes, countAtOffset = 10 } = body;
  if (!spaces?.length || !startDate || !endDate) {
    return NextResponse.json(
      { error: "spaces, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  try {
    const allRows: CsvRow[] = [];

    for (const space of spaces) {
      // Build class windows for this space
      const classWindows: ClassWindowExtended[] = (classes ?? [])
        .filter((c) => c.spaceId === space.spaceId)
        .map((c) => {
          const startLocal = addMinutes(c.date, c.time, -c.bufferBefore);
          const endLocal = addMinutes(c.date, c.time, c.bufferAfter);
          const classStartUtc = fromNZLocal(`${c.date}T${c.time}`);
          return {
            className: c.className,
            instructor: c.instructor,
            scheduledTime: c.time,
            startUtc: fromNZLocal(startLocal),
            endUtc: fromNZLocal(endLocal),
            countAtOffsetMinutes: countAtOffset,
            classStartUtc,
          };
        });

      const buckets = await fetchHistoricalMetrics1m(
        space.spaceId,
        startDate,
        endDate
      );

      const rows = buildCsvRows(buckets, space.spaceName, classWindows);
      allRows.push(...rows);
    }

    // Sort by timestamp then space_name
    allRows.sort((a, b) => {
      const tc = a.timestamp.localeCompare(b.timestamp);
      if (tc !== 0) return tc;
      return a.space_name.localeCompare(b.space_name);
    });

    const csv = rowsToCsvString(allRows);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="density-export.csv"`,
      },
    });
  } catch (error) {
    console.error("CSV export error:", error);
    return NextResponse.json(
      { error: "Failed to generate export" },
      { status: 502 }
    );
  }
}

function addMinutes(dateStr: string, timeStr: string, minutes: number): string {
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  dt.setMinutes(dt.getMinutes() + minutes);
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}`;
}
