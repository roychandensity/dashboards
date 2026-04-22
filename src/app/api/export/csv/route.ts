import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";
import { fetchHistoricalMetrics1m } from "@/lib/density-api";
import { buildSummaryRows, summaryRowsToCsvString, ClassWindowExtended, SummaryCsvRow } from "@/lib/csv-export";
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
    const allRows = (
      await Promise.all(
        spaces.map(async (space) => {
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
                date: c.date,
                startUtc: fromNZLocal(startLocal),
                endUtc: fromNZLocal(endLocal),
                countAtOffsetMinutes: countAtOffset,
                classStartUtc,
                bufferBefore: c.bufferBefore,
                bufferAfter: c.bufferAfter,
              };
            });

          const buckets = await fetchHistoricalMetrics1m(
            space.spaceId,
            startDate,
            endDate
          );

          return buildSummaryRows(buckets, space.spaceName, classWindows);
        })
      )
    ).flat();

    // Sort by date, time, then studio
    allRows.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      const tc = a.time.localeCompare(b.time);
      if (tc !== 0) return tc;
      return a.studio.localeCompare(b.studio);
    });

    const csv = summaryRowsToCsvString(allRows);

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
