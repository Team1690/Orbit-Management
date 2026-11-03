import { checkMissingAlerts } from "./alerts";
import { all, nowIso, run } from "./db";
import { ensureScheduledMeetings, meetingWindow, meetingsOn } from "./meetings";
import { getSettings } from "./settings";
import { addDays, localParts, zonedToUtc } from "./timeutil";
import { type Visit } from "./visits";

/**
 * Checks out anyone still checked in after the daily cut-off. They are credited until the
 * end of that day's last meeting if they were there for it, otherwise until the cut-off.
 * These visits are marked "auto" so captains can review them.
 */
export function autoCheckout(now = new Date()) {
  const { timezone, auto_checkout_time } = getSettings();
  for (const v of all<Visit>("SELECT * FROM visits WHERE check_out IS NULL")) {
    const checkIn = new Date(v.check_in);
    const day = localParts(checkIn, timezone).date;
    let cutoff = zonedToUtc(day, auto_checkout_time, timezone);
    if (cutoff <= checkIn) cutoff = zonedToUtc(addDays(day, 1), auto_checkout_time, timezone);
    if (now < cutoff) continue;

    let credit = cutoff;
    let lastMeetingEnd: Date | null = null;
    for (const m of meetingsOn(day)) {
      const { end } = meetingWindow(m);
      if (end > checkIn && end <= cutoff && (!lastMeetingEnd || end > lastMeetingEnd)) lastMeetingEnd = end;
    }
    if (lastMeetingEnd) credit = lastMeetingEnd;
    run("UPDATE visits SET check_out = ?, out_method = 'auto' WHERE id = ? AND check_out IS NULL", credit.toISOString(), v.id);
  }
}

let lastTick = 0;

/** Housekeeping that must happen over time. Safe to call often; it throttles itself. */
export function runTick(force = false) {
  const now = Date.now();
  if (!force && now - lastTick < 30_000) return;
  lastTick = now;
  ensureScheduledMeetings(new Date(now));
  checkMissingAlerts(new Date(now));
  autoCheckout(new Date(now));
  run("DELETE FROM sessions WHERE expires_at < ?", nowIso());
}

export function startBackgroundJobs() {
  const g = globalThis as typeof globalThis & { __orbitTimer?: NodeJS.Timeout };
  if (g.__orbitTimer) return;
  const tick = () => {
    try {
      runTick(true);
    } catch (err) {
      console.error("[orbit] background tick failed", err);
    }
  };
  g.__orbitTimer = setInterval(tick, 60_000);
  g.__orbitTimer.unref();
  tick();
}
