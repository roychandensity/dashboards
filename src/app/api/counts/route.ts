import { NextRequest, NextResponse } from "next/server";
import { fetchHistoricalMetrics1m } from "@/lib/density-api";
import { loadSchedule } from "@/lib/schedule-store";
import { findCountAtOffset } from "@/lib/count-at-offset";
import { fromNZLocal } from "@/lib/nz-time";

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SCHEDULE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const studio = searchParams.get("studio");
  const date = searchParams.get("date");
  const offset = parseInt(searchParams.get("offset") || "10", 10);

  if (!date) {
    return NextResponse.json(
      { error: "date is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const allClasses = await loadSchedule(date);
    if (allClasses.length === 0) {
      return NextResponse.json(
        { error: `No schedule found for ${date}` },
        { status: 404 }
      );
    }

    // Filter by studio if specified
    const filtered = studio
      ? allClasses.filter(
          (c) => c.studio.toLowerCase() === studio.toLowerCase()
        )
      : allClasses;

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: `No classes found for studio "${studio}" on ${date}` },
        { status: 404 }
      );
    }

    // Group by spaceId to minimize API calls
    const bySpace = new Map<string, typeof filtered>();
    for (const cls of filtered) {
      const arr = bySpace.get(cls.spaceId) ?? [];
      arr.push(cls);
      bySpace.set(cls.spaceId, arr);
    }

    const results: Array<{
      studio: string;
      class_name: string;
      instructor: string;
      scheduled_time: string;
      count_at_offset: number | null;
      offset_minutes: number;
      offset_timestamp: string | null;
    }> = [];

    for (const [spaceId, classes] of bySpace) {
      // Determine the time range needed: from earliest class - buffer to latest class + buffer + offset
      let earliestMs = Infinity;
      let latestMs = -Infinity;

      for (const cls of classes) {
        const startLocal = `${cls.date}T${cls.time}`;
        const startUtc = fromNZLocal(startLocal);
        if (!startUtc) continue;
        const startMs = new Date(startUtc).getTime();
        const windowStartMs = startMs - cls.bufferBefore * 60 * 1000;
        const windowEndMs = startMs + Math.max(cls.bufferAfter, offset) * 60 * 1000 + 2 * 60 * 1000;
        if (windowStartMs < earliestMs) earliestMs = windowStartMs;
        if (windowEndMs > latestMs) latestMs = windowEndMs;
      }

      if (earliestMs === Infinity) continue;

      const buckets = await fetchHistoricalMetrics1m(
        spaceId,
        new Date(earliestMs).toISOString(),
        new Date(latestMs).toISOString()
      );

      for (const cls of classes) {
        const classStartUtc = fromNZLocal(`${cls.date}T${cls.time}`);
        if (!classStartUtc) {
          results.push({
            studio: cls.studio,
            class_name: cls.className,
            instructor: cls.instructor,
            scheduled_time: cls.time,
            count_at_offset: null,
            offset_minutes: offset,
            offset_timestamp: null,
          });
          continue;
        }

        const { count, bucketTimestamp } = findCountAtOffset(
          buckets,
          classStartUtc,
          offset
        );

        results.push({
          studio: cls.studio,
          class_name: cls.className,
          instructor: cls.instructor,
          scheduled_time: cls.time,
          count_at_offset: count,
          offset_minutes: offset,
          offset_timestamp: bucketTimestamp,
        });
      }
    }

    return NextResponse.json({
      date,
      studio: studio ?? "all",
      offset_minutes: offset,
      classes: results,
    });
  } catch (error) {
    console.error("Counts API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch counts" },
      { status: 500 }
    );
  }
}
