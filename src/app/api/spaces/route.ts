import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";
import { fetchSpaces } from "@/lib/density-api";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spaces = await fetchSpaces();
    return NextResponse.json({ spaces });
  } catch (error) {
    console.error("Fetch spaces error:", error);
    return NextResponse.json(
      { error: "Failed to fetch spaces" },
      { status: 502 }
    );
  }
}
