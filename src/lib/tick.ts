import { checkMissingAlerts } from "./alerts";
import { all, nowIso, onServerlessHost, run } from "./db";
import { ensureScheduledMeetings, meetingWindow, meetingsOn } from "./meetings";
import { sendMeetingReminders, sendRsvpNotifications } from "./rsvp-reminders";
import { sendVolunteerAsks } from "./volunteers";
import { sendOpenMeetingFyi } from "./open-meetings";
import { sendCheckoutFollowUps } from "./checkout-reminders";
import { createRsvpVisits } from "./rsvp-visits";
import { applyAbsencesToNewMeetings } from "./absences";
import { getSettings } from "./settings";
import { sendMeetingSummaries } from "./slack";
import { addDays, localParts, zonedToUtc } from "./timeutil";
import { type Visit } from "./visits";

let lastTick = 0;

/** Housekeeping that must happen over time. Safe to call often; it throttles itself. */
export async function runTick(force = false) {
  const now = Date.now();
  if (!force && now - lastTick < 30_000) return;
  lastTick = now;
  await ensureScheduledMeetings(new Date(now));
  // Before any "Will you come?": students away on a planned absence are answered for first.
  await applyAbsencesToNewMeetings(new Date(now));
  await sendRsvpNotifications(new Date(now));
  await sendVolunteerAsks(new Date(now));
  await sendOpenMeetingFyi(new Date(now));
  await sendMeetingReminders(new Date(now));
  await checkMissingAlerts(new Date(now));
  await sendMeetingSummaries(new Date(now));
  await createRsvpVisits(new Date(now));
  await sendCheckoutFollowUps(new Date(now));
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
