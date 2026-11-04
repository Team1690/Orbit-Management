import { nameList } from "./alerts";
import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { fmtTime, relativeDay } from "./format";
import { meetingWindow, meetingsBetween, rsvpDeadline, type Meeting } from "./meetings";
import { pushToCaptains, pushToUsers, type PushPayload } from "./push";
import { getSettings } from "./settings";
import { addDays, localParts } from "./timeutil";

// The RSVP timeline of each meeting with RSVPs, in hours before the start (from Settings):
//   rsvp_open_hours      members can answer; those with reminders on get "Will you come?"
//   rsvp_reminder_hours  members who still haven't answered get a reminder
//   rsvp_close_hours     answers close; captains get the list of who didn't answer
// Each step happens once per meeting, claimed in its meetings.*_at column. Called every minute.

const HOUR = 3_600_000;

type Step = "rsvp_open_push_at" | "rsvp_reminder_at" | "rsvp_closed_at";

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
  const { rsvp_open_hours, rsvp_reminder_hours, rsvp_close_hours, timezone } = await getSettings();
  const today = localParts(now, timezone).date;
  for (const m of await meetingsBetween(today, addDays(today, Math.ceil(rsvp_open_hours / 24) + 1), false)) {
    if (!m.rsvp) continue;
    const { start } = meetingWindow(m);
    const left = start.getTime() - now.getTime();
    if (left <= 0 || left > rsvp_open_hours * HOUR) continue;
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

    const reminderDue = rsvp_reminder_hours > 0 && left <= rsvp_reminder_hours * HOUR;
    if (!m.rsvp_open_push_at && (await claim("rsvp_open_push_at", m, now))) {
      // A meeting added at short notice is already in the reminder window: this one message covers both.
      if (reminderDue) await claim("rsvp_reminder_at", m, now);
      await send("open", m, await notAnswered(m), { title: "Will you come?", body: `${when}. Tap to answer.`, url: "/", tag: `rsvp-${m.id}` });
    } else if (reminderDue && !m.rsvp_reminder_at && (await claim("rsvp_reminder_at", m, now))) {
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
