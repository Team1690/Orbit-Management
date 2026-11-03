import { all, one, run, tx } from "./db";
import { getSettings, tz } from "./settings";
import { addDays, localParts, weekdayOf, zonedToUtc } from "./timeutil";

export type Meeting = {
  id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  mandatory: number;
  rsvp: number;
  cancelled: number;
  notes: string | null;
  schedule_id: number | null;
  missing_alert_at: string | null;
};

export type SlotApplies = "all" | "in_season" | "off_season";

export type ScheduleRule = {
  id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  title: string;
  active: number;
  generated_until: string | null;
  applies: SlotApplies;
};

export const APPLIES_LABEL: Record<SlotApplies, string> = {
  all: "Every week",
  in_season: "In-season only",
  off_season: "Off-season only",
};

export type RsvpResponse = "yes" | "late" | "no";
export type Rsvp = { meeting_id: number; user_id: number; response: RsvpResponse; note: string | null; responded_at: string };

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function meetingWindow(m: Pick<Meeting, "date" | "start_time" | "end_time">) {
  const zone = tz();
  const start = zonedToUtc(m.date, m.start_time, zone);
  let end = zonedToUtc(m.date, m.end_time, zone);
  if (end <= start) end = new Date(start.getTime() + 3_600_000); // guard against bad input
  return { start, end };
}

export function getMeeting(id: number) {
  return one<Meeting>("SELECT * FROM meetings WHERE id = ?", id);
}

/** Meetings whose local date falls in [fromDate, toDate], both inclusive. */
export function meetingsBetween(fromDate: string, toDate: string, includeCancelled = true) {
  return all<Meeting>(
    `SELECT * FROM meetings WHERE date >= ? AND date <= ? AND (? OR cancelled = 0) ORDER BY date, start_time`,
    fromDate,
    toDate,
    includeCancelled,
  );
}

export function meetingsOn(date: string) {
  return meetingsBetween(date, date, false);
}

/** The meeting happening now, or else the next one today or later. */
export function currentOrNextMeeting(now = new Date()) {
  const t = localParts(now, tz()).date;
  for (const m of meetingsBetween(t, addDays(t, 14), false)) {
    if (meetingWindow(m).end > now) return m;
  }
  return undefined;
}

/** Meetings members should be answering right now: RSVP enabled, not started, within the RSVP window. */
export function openRsvpMeetings(now = new Date()) {
  const { rsvp_open_hours } = getSettings();
  const t = localParts(now, tz()).date;
  const horizon = now.getTime() + rsvp_open_hours * 3_600_000;
  return meetingsBetween(t, addDays(t, Math.ceil(rsvp_open_hours / 24) + 1), false).filter((m) => {
    if (!m.rsvp) return false;
    const { start } = meetingWindow(m);
    return start > now && start.getTime() <= horizon;
  });
}

export function rsvpsFor(meetingIds: number[]) {
  if (meetingIds.length === 0) return [];
  return all<Rsvp>(`SELECT * FROM rsvps WHERE meeting_id IN (${meetingIds.map(() => "?").join(",")})`, ...meetingIds);
}

export function setRsvp(meetingId: number, userId: number, response: RsvpResponse, note: string | null) {
  run(
    `INSERT INTO rsvps (meeting_id, user_id, response, note, responded_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(meeting_id, user_id) DO UPDATE SET response = excluded.response, note = excluded.note, responded_at = excluded.responded_at`,
    meetingId,
    userId,
    response,
    note,
    new Date().toISOString(),
  );
}

export function listSchedule() {
  return all<ScheduleRule>("SELECT * FROM schedule ORDER BY weekday, start_time");
}

/** In-season if an in-season period covers the date; every other date counts as off-season. */
export function seasonKindOn(date: string): "in_season" | "off_season" {
  return one("SELECT 1 FROM seasons WHERE kind = 'in_season' AND start_date <= ? AND end_date >= ?", date, date)
    ? "in_season"
    : "off_season";
}

export function slotAppliesOn(rule: Pick<ScheduleRule, "weekday" | "applies">, date: string, kind = seasonKindOn(date)) {
  return weekdayOf(date) === rule.weekday && (rule.applies === "all" || rule.applies === kind);
}

/** Creates meetings from the weekly schedule up to `schedule_days_ahead` days from today. */
export function ensureScheduledMeetings(now = new Date()) {
  const { schedule_days_ahead, timezone } = getSettings();
  const today = localParts(now, timezone).date;
  const horizon = addDays(today, schedule_days_ahead);
  const kinds = new Map<string, "in_season" | "off_season">();
  const kindOn = (d: string) => kinds.get(d) ?? kinds.set(d, seasonKindOn(d)).get(d)!;
  for (const rule of all<ScheduleRule>("SELECT * FROM schedule WHERE active = 1")) {
    let d = rule.generated_until ? addDays(rule.generated_until, 1) : today;
    if (d < today) d = today;
    if (d > horizon) continue;
    tx(() => {
      for (; d <= horizon; d = addDays(d, 1)) {
        if (!slotAppliesOn(rule, d, kindOn(d))) continue;
        run(
          `INSERT INTO meetings (title, date, start_time, end_time, mandatory, rsvp, schedule_id)
           SELECT ?, ?, ?, ?, 1, 1, ? WHERE NOT EXISTS (SELECT 1 FROM meetings WHERE schedule_id = ? AND date = ?)`,
          rule.title,
          d,
          rule.start_time,
          rule.end_time,
          rule.id,
          rule.id,
          d,
        );
      }
      run("UPDATE schedule SET generated_until = ? WHERE id = ?", horizon, rule.id);
    });
  }
}

/**
 * After the weekly slots or the season dates change: removes future meetings whose slot no
 * longer applies on that date (unless someone already answered the RSVP), then fills in any
 * dates a slot now applies to.
 */
export function resyncSchedule(now = new Date()) {
  const today = localParts(now, getSettings().timezone).date;
  const rules = new Map(all<ScheduleRule>("SELECT * FROM schedule WHERE active = 1").map((r) => [r.id, r]));
  tx(() => {
    for (const m of all<Meeting>(
      `SELECT * FROM meetings WHERE schedule_id IS NOT NULL AND date > ?
         AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.meeting_id = meetings.id)`,
      today,
    )) {
      const rule = rules.get(m.schedule_id!);
      if (!rule || !slotAppliesOn(rule, m.date)) run("DELETE FROM meetings WHERE id = ?", m.id);
    }
    run("UPDATE schedule SET generated_until = NULL");
  });
  ensureScheduledMeetings(now);
}
