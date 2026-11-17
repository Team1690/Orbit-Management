import { nameList } from "./alerts";
import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { fmtTime, relativeDay } from "./format";
import { meetingWindow, openRsvpMeetings, rsvpDeadline, type Meeting } from "./meetings";
import { pushToCaptains, pushToUsers, type PushPayload } from "./push";
import { getSettings, tz } from "./settings";
import { addDays, localParts } from "./timeutil";

// The RSVP timeline of each meeting with RSVPs, in hours before the start (from Settings):
//   rsvp_open_hours      members can answer (one-off meetings: from creation); those with
//                        reminders on get "Will you come?"
//   rsvp_reminder_hours  every this many hours after answers open, members who still haven't
//                        answered get a reminder (not at night), until answers close
//   rsvp_close_hours     answers close; captains get the list of who didn't answer
// Plus each meeting's own reminder (meetings.reminder_hours, set by a captain) for everyone expected.
// Each step is claimed in its meetings.*_at column (the reminder's holds the last one sent). Called every minute.

const HOUR = 3_600_000;
/** No RSVP reminders between these local hours (22:00–07:00); a reminder due at night waits for the morning. */
const QUIET_START = 22;
const QUIET_END = 7;

type Step = "rsvp_open_push_at" | "rsvp_reminder_at" | "rsvp_closed_at" | "reminder_sent_at";

/** Marks a step done for the meeting; false when another tick already did it. */
async function claim(step: Step, m: Meeting, now: Date) {
  return (await run(`UPDATE meetings SET ${step} = ? WHERE id = ? AND ${step} IS NULL`, now.toISOString(), m.id)).changes > 0;
}

/** Students expected at the meeting who haven't answered. */
async function notAnswered(m: Meeting) {
  const rows = (await computeAttendance([m])).get(m.id) ?? new Map();
  return [...rows].filter(([, e]) => !e.rsvp).map(([id]) => id as number);
}

async function send(step: string, m: Meeting, to: number[] | "captains", payload: PushPayload) {
  const sent = await (to === "captains" ? pushToCaptains(payload) : pushToUsers(to, payload)).catch((err) => {
    console.error(`[orbit] RSVP ${step} push failed`, err);
    return 0;
  });
  console.info(`[orbit] RSVP ${step} for meeting ${m.id}: sent to ${sent} device${sent === 1 ? "" : "s"}`);
}

export async function sendRsvpNotifications(now = new Date()) {
  const { rsvp_reminder_hours, rsvp_close_hours } = await getSettings();
  for (const m of await openRsvpMeetings(now)) {
    const { start } = meetingWindow(m);
    const left = start.getTime() - now.getTime();
    const when = `${m.title} · ${relativeDay(m.date)} ${fmtTime(start)}`;

    // Answers have closed: tell the captains who didn't answer. Members get nothing more.
    if (rsvp_close_hours > 0 && left <= rsvp_close_hours * HOUR) {
      if (m.rsvp_closed_at || !(await claim("rsvp_closed_at", m, now))) continue;
      const missing = await notAnswered(m);
      if (missing.length === 0) continue;
      const names = new Map((await all<{ id: number; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
      const title = `${missing.length} didn't answer · ${when}`;
      const body = `No answer: ${nameList(missing.map((id) => names.get(id) ?? "?").sort((a, b) => a.localeCompare(b)))}.`;
      await run("INSERT INTO alerts (kind, meeting_id, title, body, created_at) VALUES ('no_rsvp', ?, ?, ?, ?)", m.id, title, body, now.toISOString());
      await send("closed", m, "captains", { title, body, url: `/meetings/${m.id}`, tag: `no-rsvp-${m.id}` });
      continue;
    }

    if (!m.rsvp_open_push_at) {
      if (await claim("rsvp_open_push_at", m, now)) {
        await send("open", m, await notAnswered(m), { title: "Will you come?", body: `${when}. Tap to answer.`, url: "/", tag: `rsvp-${m.id}` });
      }
      continue;
    }
    // Every `rsvp_reminder_hours` since answers opened (or since the last reminder), but not at night.
    const last = Date.parse(m.rsvp_reminder_at ?? m.rsvp_open_push_at);
    const hour = Number(localParts(now, tz()).time.slice(0, 2));
    const reminderDue = rsvp_reminder_hours > 0 && now.getTime() - last >= rsvp_reminder_hours * HOUR && hour >= QUIET_END && hour < QUIET_START;
    if (
      reminderDue &&
      (
        await run(
          "UPDATE meetings SET rsvp_reminder_at = ? WHERE id = ? AND rsvp_reminder_at IS NOT DISTINCT FROM ?::text",
          now.toISOString(),
          m.id,
          m.rsvp_reminder_at,
        )
      ).changes > 0
    ) {
      const deadline = rsvpDeadline(m, rsvp_close_hours);
      const by = deadline ? ` Answers close at ${fmtTime(deadline)}.` : "";
      await send("reminder", m, await notAnswered(m), {
        title: "Reminder: will you come?",
        body: `${when}. You haven't answered yet.${by}`,
        url: "/",
        tag: `rsvp-${m.id}`,
      });
    }
  }
}

/**
 * Each meeting's own reminder, `reminder_hours` before the start, to everyone expected except those
 * who can't come, and to lead mentors (they follow every meeting, even with captain alerts off).
 */
export async function sendMeetingReminders(now = new Date()) {
  const today = localParts(now, (await getSettings()).timezone).date;
  // Reminders are at most a week ahead (see actions/meetings.ts).
  const due = await all<Meeting>(
    "SELECT * FROM meetings WHERE reminder_hours > 0 AND reminder_sent_at IS NULL AND cancelled = 0 AND date >= ? AND date <= ?",
    today,
    addDays(today, 8),
  );
  const leadMentors = (await all<{ id: number }>("SELECT id FROM users WHERE active = 1 AND role = 'mentor' AND lead_mentor = 1")).map((u) => u.id);
  for (const m of due) {
    const { start, end } = meetingWindow(m);
    const left = start.getTime() - now.getTime();
    if (left <= 0 || left > m.reminder_hours! * HOUR) continue;
    if (!(await claim("reminder_sent_at", m, now))) continue;
    const rows = (await computeAttendance([m])).get(m.id) ?? new Map();
    // Mentors who volunteered for it get the reminder too.
    const mentorVolunteers = (
      await all<{ user_id: number }>("SELECT v.user_id FROM volunteers v JOIN users u ON u.id = v.user_id WHERE v.meeting_id = ? AND u.role = 'mentor'", m.id)
    ).map((v) => v.user_id);
    const to = [...new Set([...[...rows].filter(([, e]) => e.rsvp?.response !== "no").map(([id]) => id as number), ...leadMentors, ...mentorVolunteers])];
    await send("meeting reminder", m, to, {
      title: `Reminder: ${m.title}`,
      body: `${relativeDay(m.date)} ${fmtTime(start)}–${fmtTime(end)}. See you there!`,
      url: "/",
      tag: `meeting-${m.id}`,
    });
  }
}
