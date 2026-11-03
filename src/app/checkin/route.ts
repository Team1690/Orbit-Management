import { NextResponse, type NextRequest } from "next/server";
import { getUser, secureCookies } from "@/lib/auth";
import { PENDING_COOKIE, appOrigin, pendingCheckinToken, verifyQrCode } from "@/lib/qr";
import { checkIn } from "@/lib/visits";

// Target of the check-in QR code when it's scanned with the phone's normal camera app.
// Logged in: checks in right away. Logged out: remembers the valid scan for 15 minutes
// and finishes the check-in after login.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("c") ?? "";
  const go = (path: string) => NextResponse.redirect(new URL(path, appOrigin(request.headers)), 303);

  if (!verifyQrCode(code)) return go("/?ci=expired");

  const user = await getUser();
  if (user) {
    const { already } = checkIn(user.id, "qr");
    return go(already ? "/?ci=already" : "/?ci=ok");
  }

  const res = go("/login");
  res.cookies.set(PENDING_COOKIE, pendingCheckinToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: await secureCookies(),
    path: "/",
    maxAge: 15 * 60,
  });
  return res;
}
