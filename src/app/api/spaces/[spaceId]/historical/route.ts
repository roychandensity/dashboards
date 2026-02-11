import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";
import { fetchHistoricalMetrics } from "@/lib/density-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { spaceId } = await params;

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const resolution = searchParams.get("resolution") || "5m";

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "start_date and end_date are required" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchHistoricalMetrics({
      spaceId,
      startDate,
      endDate,
      resolution,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Historical metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch historical data" },
      { status: 502 }
    );
  }
}
