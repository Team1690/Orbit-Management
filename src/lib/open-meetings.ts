import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { fmtTime, relativeDay } from "./format";
import { meetingWindow, type Meeting } from "./meetings";
import { listStudents } from "./members";
import { today } from "./periods";
import { pushToUsers } from "./push";
import { askable, openSpots, slotsFor, volunteersFor } from "./volunteers";

// Open meetings: everyone sees them on their home screen, and everyone gets one FYI notification.
// It is quiet (no sound) for people who aren't expected, where the phone allows it. People who are
// expected and will get "Will you come?" (a meeting with RSVPs), or who will get a volunteer
// request, skip the FYI so nobody gets two notifications for one meeting. Sent once per meeting,
// claimed in meetings.fyi_sent_at; called on creation, on edit and every minute.

export async function sendOpenMeetingFyi(now = new Date()) {
  const due = await all<Meeting>("SELECT * FROM meetings WHERE open_to_all = 1 AND fyi_sent_at IS NULL AND cancelled = 0 AND date >= ?", today());
  for (const m of due) {
    const { start, end } = meetingWindow(m);
    if (start <= now) continue;
    if ((await run("UPDATE meetings SET fyi_sent_at = ? WHERE id = ? AND fyi_sent_at IS NULL", now.toISOString(), m.id)).changes === 0) continue;

    const expected = new Set([...((await computeAttendance([m])).get(m.id)?.keys() ?? [])]);
    const slots = (await slotsFor([m.id])).get(m.id) ?? [];
    const asked = new Set<number>();
    if (slots.length) {
      const volunteers = (await volunteersFor([m.id])).get(m.id) ?? [];
      for (const s of askable(m, await listStudents(), slots, volunteers, await openSpots(m.id, slots, volunteers))) asked.add(s.id);
    }
    const everyone = (await all<{ id: number }>("SELECT id FROM users WHERE active = 1")).map((u) => u.id);
    const loud = m.rsvp ? [] : everyone.filter((id) => expected.has(id));
    const quiet = everyone.filter((id) => !expected.has(id) && !asked.has(id));

    const when = `${relativeDay(m.date)} ${fmtTime(start)}–${fmtTime(end)}`;
    const base = { title: `FYI: ${m.title}`, url: "/", tag: `fyi-${m.id}` };
    const sent = await Promise.all([
      pushToUsers(loud, { ...base, body: `${when}. You're expected at this meeting.` }),
      pushToUsers(quiet, { ...base, body: `${when}. Open to everyone: come if you'd like.`, silent: true }),
    ]).catch((err) => {
      console.error("[orbit] open meeting FYI push failed", err);
      return [0, 0];
    });
    console.info(`[orbit] open meeting FYI for meeting ${m.id}: ${loud.length} expected, ${quiet.length} quietly, sent to ${sent[0] + sent[1]} devices`);
  }
}
