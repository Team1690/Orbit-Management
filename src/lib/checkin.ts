import { cookies } from "next/headers";
import { PENDING_COOKIE, verifyPendingCheckin } from "./qr";
import { checkIn } from "./visits";

/**
 * If this browser scanned a valid QR code before logging in, finishes that check-in.
 * Returns where to send the member next, or null when there was nothing pending.
 * Only callable from Server Actions and Route Handlers (it deletes a cookie).
 */
export async function completePendingCheckin(userId: number) {
  const jar = await cookies();
  const pending = jar.get(PENDING_COOKIE)?.value;
  if (!pending) return null;
  jar.delete(PENDING_COOKIE);
  if (!verifyPendingCheckin(pending)) return "/?ci=expired";
  const { already } = checkIn(userId, "qr");
  return already ? "/?ci=already" : "/?ci=ok";
}
