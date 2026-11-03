import crypto from "node:crypto";
import { getSettings } from "./settings";

// The check-in QR code holds a URL with a short-lived signed code. The code changes every
// `qr_rotate_min` minutes, so a photo of the slide stops working soon after the meeting starts.

const GRACE_MS = 45_000; // time to scan, unlock the phone and load the page
const PENDING_MS = 15 * 60_000; // time to log in after scanning while logged out

function sign(secret: string, message: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64url").slice(0, 22);
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function currentQrCode(now = Date.now()) {
  const { qr_secret, qr_rotate_min } = await getSettings();
  const period = qr_rotate_min * 60_000;
  const window = Math.floor(now / period);
  return {
    code: `${window.toString(36)}.${sign(qr_secret, `checkin:${window}`)}`,
    msUntilNext: (window + 1) * period - now,
  };
}

export async function verifyQrCode(code: string, now = Date.now()) {
  const { qr_secret, qr_rotate_min } = await getSettings();
  const [w, sig] = code.split(".");
  const window = parseInt(w ?? "", 36);
  if (!Number.isSafeInteger(window) || !sig) return false;
  const period = qr_rotate_min * 60_000;
  const windowStart = window * period;
  if (windowStart > now + 5_000) return false;
  if (now > windowStart + period + GRACE_MS) return false;
  return safeEqual(sig, sign(qr_secret, `checkin:${window}`));
}

/** Remembers a valid scan in a cookie while the member logs in. */
export async function pendingCheckinToken(now = Date.now()) {
  const exp = now + PENDING_MS;
  return `${exp}.${sign((await getSettings()).qr_secret, `pending:${exp}`)}`;
}

export async function verifyPendingCheckin(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  return safeEqual(sig, sign((await getSettings()).qr_secret, `pending:${exp}`));
}

export const PENDING_COOKIE = "orbit_pending_checkin";

/** Pulls the code out of a scanned QR (a full check-in URL or just the code). */
export function extractCode(scanned: string) {
  try {
    return new URL(scanned).searchParams.get("c") ?? "";
  } catch {
    return scanned.trim();
  }
}

export function appOrigin(h: Headers) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // On Vercel, the project's public address. A captain may be browsing a deployment's own
  // address, which only opens for people logged in to Vercel, so it must not end up in links.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
