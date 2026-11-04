import { checkMissingAlerts } from "./alerts";
import { all, nowIso, onServerlessHost, run } from "./db";
import { ensureScheduledMeetings, meetingWindow, meetingsOn } from "./meetings";
import { sendRsvpNotifications } from "./rsvp-reminders";
import { getSettings } from "./settings";
import { sendMeetingSummaries } from "./slack";
import { addDays, localParts, zonedToUtc } from "./timeutil";
import { type Visit } from "./visits";

/**
 * Checks out anyone still checked in after the daily cut-off. They are credited until the
 * end of that day's last meeting if they were there for it, otherwise until the cut-off.
 * These visits are marked "auto" so captains can review them.
 */
export async function autoCheckout(now = new Date()) {
  const { timezone, auto_checkout_time } = await getSettings();
  for (const v of await all<Visit>("SELECT * FROM visits WHERE check_out IS NULL")) {
    const checkIn = new Date(v.check_in);
    const day = localParts(checkIn, timezone).date;
    let cutoff = zonedToUtc(day, auto_checkout_time, timezone);
    if (cutoff <= checkIn) cutoff = zonedToUtc(addDays(day, 1), auto_checkout_time, timezone);
    if (now < cutoff) continue;

    let credit = cutoff;
    let lastMeetingEnd: Date | null = null;
    for (const m of await meetingsOn(day)) {
      const { end } = meetingWindow(m);
      if (end > checkIn && end <= cutoff && (!lastMeetingEnd || end > lastMeetingEnd)) lastMeetingEnd = end;
    }
    if (lastMeetingEnd) credit = lastMeetingEnd;
    await run("UPDATE visits SET check_out = ?, out_method = 'auto' WHERE id = ? AND check_out IS NULL", credit.toISOString(), v.id);
  }
}

let lastTick = 0;

/** Housekeeping that must happen over time. Safe to call often; it throttles itself. */
export async function runTick(force = false) {
  const now = Date.now();
  if (!force && now - lastTick < 30_000) return;
  lastTick = now;
  await ensureScheduledMeetings(new Date(now));
  await sendRsvpNotifications(new Date(now));
  await checkMissingAlerts(new Date(now));
  await sendMeetingSummaries(new Date(now));
  await autoCheckout(new Date(now));
  await run("DELETE FROM sessions WHERE expires_at < ?", nowIso());
}

/** Runs the jobs every minute while the server is up. */
export function startBackgroundJobs() {
  // Serverless hosts only give the server CPU while it handles a request, so a timer could stall
  // mid-transaction and hold the lock. There, an external scheduler calls /api/cron instead.
  if (onServerlessHost) return;
  const g = globalThis as typeof globalThis & { __orbitTimer?: NodeJS.Timeout };
  if (g.__orbitTimer) return;
  const tick = () => runTick(true).catch((err) => console.error("[orbit] background tick failed", err));
  g.__orbitTimer = setInterval(tick, 60_000);
  g.__orbitTimer.unref();
  void tick();
}
