import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { meetingWindow, type Meeting } from "./meetings";
import { getSettings } from "./settings";
import { addDays, localParts } from "./timeutil";

// One-off meetings with "No check-in needed": once the meeting ends, everyone counted present
// (answered Coming or Late, unless a captain marked them otherwise) who didn't actually check in gets a
// visit for the meeting's time, so their hours add up like everyone else's. The visit is marked
// in_method/out_method 'rsvp'. Once per meeting, claimed in meetings.auto_visits_at; called every minute.

export async function createRsvpVisits(now = new Date()) {
  const today = localParts(now, (await getSettings()).timezone).date;
  const due = (
    await all<Meeting>(
      "SELECT * FROM meetings WHERE no_checkin = 1 AND cancelled = 0 AND auto_visits_at IS NULL AND date >= ? AND date <= ?",
      addDays(today, -7),
      today,
    )
  ).filter((m) => meetingWindow(m).end <= now);

  for (const m of due) {
    if ((await run("UPDATE meetings SET auto_visits_at = ? WHERE id = ? AND auto_visits_at IS NULL", now.toISOString(), m.id)).changes === 0) continue;
    const { start, end } = meetingWindow(m);
    const rows = (await computeAttendance([m])).get(m.id) ?? new Map();
    let added = 0;
    for (const [userId, e] of rows) {
      if (e.firstIn || (e.status !== "present" && e.status !== "late")) continue;
      await run(
        "INSERT INTO visits (user_id, check_in, check_out, in_method, out_method) VALUES (?, ?, ?, 'rsvp', 'rsvp')",
        userId,
        start.toISOString(),
        end.toISOString(),
      );
      added += 1;
    }
    console.info(`[orbit] no-check-in meeting ${m.id}: added ${added} visits from RSVPs`);
  }
}
