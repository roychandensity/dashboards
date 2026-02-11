import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions } from "@/lib/session";
import { getWebSocketUrl } from "@/lib/density-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ doorwayId: string }> }
) {
  // Auth check
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { doorwayId } = await params;

  try {
    const wsUrl = await getWebSocketUrl(doorwayId);
    return NextResponse.json({ ws_url: wsUrl });
  } catch (error) {
    console.error("WebSocket broker error:", error);
    return NextResponse.json(
      { error: "Failed to get WebSocket URL" },
      { status: 502 }
    );
  }
}
