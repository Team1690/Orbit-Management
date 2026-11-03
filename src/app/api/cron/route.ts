import { NextResponse, type NextRequest } from "next/server";
import { runTick } from "@/lib/tick";

// The server already runs these jobs every minute. This endpoint is for hosts that
// suspend idle servers: point an external scheduler at it with CRON_SECRET.
export function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  runTick(true);
  return NextResponse.json({ ok: true });
}
