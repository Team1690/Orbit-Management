import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { meetingWindow, meetingsBetween, setRsvp, type Meeting } from "./meetings";
import { today } from "./periods";

// Planned absences: a student says in advance they'll be away from one date to another, with a
// short reason. Every meeting with RSVPs in that range that they're expected at is answered
// "Can't come" with that reason (rsvps.absence_id links the answer to the absence). Saving an
// absence answers all of them, replacing earlier answers; meetings added later are answered on the
// next tick, but only if the student hasn't answered them. Deleting the absence removes the answers it
// gave to meetings that haven't started. The student can still change any single answer by hand.

export type Absence = { id: number; user_id: number; start_date: string; end_date: string; reason: string; created_at: string };

/** A student's absences that haven't ended, soonest first. */
export function upcomingAbsences(userId: number) {
  return all<Absence>("SELECT * FROM absences WHERE user_id = ? AND end_date >= ? ORDER BY start_date", userId, today());
}

/** Meetings in the absence's range that haven't started, take RSVPs and expect this student. */
async function meetingsFor(a: Absence, now: Date) {
  const meetings = (await meetingsBetween(a.start_date, a.end_date, false)).filter((m) => m.rsvp && meetingWindow(m).start > now);
  const expected = await computeAttendance(meetings, [a.user_id]);
  return meetings.filter((m) => expected.get(m.id)?.has(a.user_id));
}

/** Answers "Can't come" for the absence's meetings; `replace` also overwrites answers already given. Returns how many. */
export async function applyAbsence(a: Absence, replace: boolean, now = new Date()) {
  let answered = 0;
  for (const m of await meetingsFor(a, now)) {
    if (!replace && (await all("SELECT 1 FROM rsvps WHERE meeting_id = ? AND user_id = ?", m.id, a.user_id)).length) continue;
    await setRsvp(m.id, a.user_id, "no", a.reason, null, null, a.id);
    answered += 1;
  }
  return answered;
}

/** Answers meetings created since the absences were saved (weekly meetings, new one-offs). Called every minute. */
export async function applyAbsencesToNewMeetings(now = new Date()) {
  for (const a of await all<Absence>("SELECT * FROM absences WHERE end_date >= ?", today())) await applyAbsence(a, false, now);
}

/** Deletes an absence and the answers it gave to meetings that haven't started. */
export async function removeAbsence(a: Absence, now = new Date()) {
  const linked = await all<Meeting>(
    "SELECT m.* FROM rsvps r JOIN meetings m ON m.id = r.meeting_id WHERE r.absence_id = ?",
    a.id,
  );
  for (const m of linked.filter((m) => meetingWindow(m).start > now)) {
    await run("DELETE FROM rsvps WHERE meeting_id = ? AND user_id = ? AND absence_id = ?", m.id, a.user_id, a.id);
  }
  await run("DELETE FROM absences WHERE id = ?", a.id);
}
