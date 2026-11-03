import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { appOrigin, currentQrCode } from "@/lib/qr";
import { getSettings } from "@/lib/settings";

// The current check-in QR code as SVG, for the display page. Captains only, or a screen
// that has the display key.
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("k");
  const user = await getUser();
  if (user?.role !== "captain" && (!key || key !== (await getSettings()).display_key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { code, msUntilNext } = await currentQrCode();
  const url = `${appOrigin(request.headers)}/checkin?c=${code}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0f1e5c", light: "#ffffff" } });
  const present = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM visits WHERE check_out IS NULL"))!.n;
  return NextResponse.json({ svg, url, msUntilNext, present }, { headers: { "Cache-Control": "no-store" } });
}
