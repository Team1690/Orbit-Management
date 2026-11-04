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
  slack_sent_at: string | null;
  rsvp_open_push_at: string | null;
  rsvp_reminder_at: string | null;
  rsvp_closed_at: string | null;
  /** Who needs to come, as JSON (see audience.ts); null = the whole team. */
  audience: string | null;
  /** Hours before the start to notify everyone expected; null = no reminder. */
  reminder_hours: number | null;
  reminder_sent_at: string | null;
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
  /** Copied to each meeting the slot creates (see audience.ts); null = the whole team. */
  audience: string | null;
  /** Copied to each meeting the slot creates; null = no reminder. */
  reminder_hours: number | null;
};

export const APPLIES_LABEL: Record<SlotApplies, string> = {
  all: "Every week",
  in_season: "In-season only",
  off_season: "Off-season only",
};

export type RsvpResponse = "yes" | "late" | "no";
export type Rsvp = {
  meeting_id: number;
  user_id: number;
  response: RsvpResponse;
  note: string | null;
  /** For "late": the upper end of the expected delay in minutes (see late-by.ts). */
  late_by_min: number | null;
  responded_at: string;
  /** The captain who set this answer, or null when the member answered. */
  updated_by: number | null;
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function meetingWindow(m: Pick<Meeting, "date" | "start_time" | "end_time">) {
  const zone = tz();
  const start = zonedToUtc(m.date, m.start_time, zone);
  let end = zonedToUtc(m.date, m.end_time, zone);
  if (end <= start) end = new Date(start.getTime() + 3_600_000); // guard against bad input
  return { start, end };
}

export async function getMeeting(id: number) {
  if (!Number.isSafeInteger(id)) return undefined; // e.g. /meetings/abc
  return one<Meeting>("SELECT * FROM meetings WHERE id = ?", id);
}

/** Meetings whose local date falls in [fromDate, toDate], both inclusive. */
export function meetingsBetween(fromDate: string, toDate: string, includeCancelled = true) {
  return all<Meeting>(
    `SELECT * FROM meetings WHERE date >= ? AND date <= ? AND (? = 1 OR cancelled = 0) ORDER BY date, start_time`,
    fromDate,
    toDate,
    includeCancelled,
  );
}

export function meetingsOn(date: string) {
  return meetingsBetween(date, date, false);
}

/** The meeting happening now, or else the next one today or later. */
export async function currentOrNextMeeting(now = new Date()) {
  const t = localParts(now, tz()).date;
  for (const m of await meetingsBetween(t, addDays(t, 14), false)) {
    if (meetingWindow(m).end > now) return m;
  }
  return undefined;
}

/** Meetings members should be answering right now: RSVP enabled, not started, within the RSVP window. */
/**
 * Meetings taking answers right now: RSVP enabled and not started. Weekly meetings open
 * `rsvp_open_hours` before the start; one-off meetings as soon as they're created.
 */
export async function openRsvpMeetings(now = new Date()) {
  const { rsvp_open_hours } = await getSettings();
  const t = localParts(now, tz()).date;
  const horizon = now.getTime() + rsvp_open_hours * 3_600_000;
  const soon = await meetingsBetween(t, addDays(t, Math.ceil(rsvp_open_hours / 24) + 1), false);
  const oneOffs = await all<Meeting>("SELECT * FROM meetings WHERE schedule_id IS NULL AND cancelled = 0 AND date >= ?", t);
  return [...new Map([...soon, ...oneOffs].map((m) => [m.id, m])).values()]
    .filter((m) => {
      if (!m.rsvp) return false;
      const { start } = meetingWindow(m);
      return start > now && (m.schedule_id === null || start.getTime() <= horizon);
    })
    .sort((a, b) => meetingWindow(a).start.getTime() - meetingWindow(b).start.getTime());
}

export async function rsvpsFor(meetingIds: number[]) {
  if (meetingIds.length === 0) return [];
  return all<Rsvp>(`SELECT * FROM rsvps WHERE meeting_id IN (${meetingIds.map(() => "?").join(",")})`, ...meetingIds);
}

/** Saves an answer. `updatedBy` is the captain who set it, or null when the member answered. */
export async function setRsvp(
  meetingId: number,
  userId: number,
  response: RsvpResponse,
  note: string | null,
  lateByMin: number | null,
  updatedBy: number | null = null,
) {
  await run(
    `INSERT INTO rsvps (meeting_id, user_id, response, note, late_by_min, responded_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(meeting_id, user_id) DO UPDATE SET response = excluded.response, note = excluded.note,
       late_by_min = excluded.late_by_min, responded_at = excluded.responded_at, updated_by = excluded.updated_by`,
    meetingId,
    userId,
    response,
    note,
    lateByMin,
    new Date().toISOString(),
    updatedBy,
  );
}

/** When members stop being able to answer, `closeHours` before the start; null when there's no deadline. */
export function rsvpDeadline(m: Pick<Meeting, "date" | "start_time" | "end_time">, closeHours: number) {
  return closeHours > 0 ? new Date(meetingWindow(m).start.getTime() - closeHours * 3_600_000) : null;
}

export function listSchedule() {
  return all<ScheduleRule>("SELECT * FROM schedule ORDER BY weekday, start_time");
}

/** In-season if an in-season period covers the date; every other date counts as off-season. */
export async function seasonKindOn(date: string): Promise<"in_season" | "off_season"> {
  return (await one("SELECT 1 FROM seasons WHERE kind = 'in_season' AND start_date <= ? AND end_date >= ?", date, date))
    ? "in_season"
    : "off_season";
}

export function slotAppliesOn(rule: Pick<ScheduleRule, "weekday" | "applies">, date: string, kind: "in_season" | "off_season") {
  return weekdayOf(date) === rule.weekday && (rule.applies === "all" || rule.applies === kind);
}

/** Creates meetings from the weekly schedule up to `schedule_days_ahead` days from today. */
export async function ensureScheduledMeetings(now = new Date()) {
  const { schedule_days_ahead, timezone } = await getSettings();
  const today = localParts(now, timezone).date;
  const horizon = addDays(today, schedule_days_ahead);
  const kinds = new Map<string, "in_season" | "off_season">();
  const kindOn = async (d: string) => kinds.get(d) ?? kinds.set(d, await seasonKindOn(d)).get(d)!;
  for (const rule of await all<ScheduleRule>("SELECT * FROM schedule WHERE active = 1")) {
    let d = rule.generated_until ? addDays(rule.generated_until, 1) : today;
    if (d < today) d = today;
    if (d > horizon) continue;
    await tx(async () => {
      for (; d <= horizon; d = addDays(d, 1)) {
        if (!slotAppliesOn(rule, d, await kindOn(d))) continue;
        await run(
          `INSERT INTO meetings (title, date, start_time, end_time, mandatory, rsvp, schedule_id, audience, reminder_hours)
           SELECT ?, ?, ?, ?, 1, 1, ?::int, ?::text, ?::int WHERE NOT EXISTS (SELECT 1 FROM meetings WHERE schedule_id = ? AND date = ?)`,
          rule.title,
          d,
          rule.start_time,
          rule.end_time,
          rule.id,
          rule.audience,
          rule.reminder_hours,
          rule.id,
          d,
        );
      }
      await run("UPDATE schedule SET generated_until = ? WHERE id = ?", horizon, rule.id);
    });
  }
}

/**
 * After the weekly slots or the season dates change: removes future meetings whose slot no
 * longer applies on that date (unless someone already answered the RSVP), then fills in any
 * dates a slot now applies to.
 */
export async function resyncSchedule(now = new Date()) {
  const today = localParts(now, (await getSettings()).timezone).date;
  const rules = new Map((await all<ScheduleRule>("SELECT * FROM schedule WHERE active = 1")).map((r) => [r.id, r]));
  await tx(async () => {
    for (const m of await all<Meeting>(
      `SELECT * FROM meetings WHERE schedule_id IS NOT NULL AND date > ?
         AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.meeting_id = meetings.id)`,
      today,
    )) {
      const rule = rules.get(m.schedule_id!);
      if (!rule || !slotAppliesOn(rule, m.date, await seasonKindOn(m.date))) await run("DELETE FROM meetings WHERE id = ?", m.id);
    }
    await run("UPDATE schedule SET generated_until = NULL");
  });
  await ensureScheduledMeetings(now);
}
