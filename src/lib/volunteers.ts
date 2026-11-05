import { inAudience, parseAudience } from "./audience";
import { all, run } from "./db";
import { fmtTime, relativeDay } from "./format";
import { meetingWindow, type Meeting } from "./meetings";
import { listStudents, type Member } from "./members";
import { pushToUsers } from "./push";
import { today } from "./periods";

// Volunteers for one-off meetings. A captain asks for, say, 3 from Mechanical and 2 from anyone;
// students who aren't already expected see the request on their home screen and get a notification,
// and can only say yes. A volunteer is then expected like everyone invited (attendance, RSVP set to
// "Coming", the meeting's reminder). If spots are still open `volunteer_reask_hours` after the first
// ask, everyone who could still fill one is asked again. Called on creation and every minute.

/** A request for `wanted` volunteers from one team; team null = anyone on the team. */
export type VolunteerSlot = { id: number; meeting_id: number; team: string | null; wanted: number };
/** team: the slot they filled. */
export type Volunteer = { meeting_id: number; user_id: number; team: string | null; created_at: string };

function inList(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}

function byMeeting<T extends { meeting_id: number }>(rows: T[]) {
  const map = new Map<number, T[]>();
  for (const r of rows) map.set(r.meeting_id, [...(map.get(r.meeting_id) ?? []), r]);
  return map;
}

export async function slotsFor(meetingIds: number[]) {
  if (meetingIds.length === 0) return new Map<number, VolunteerSlot[]>();
  return byMeeting(
    await all<VolunteerSlot>(`SELECT * FROM volunteer_slots WHERE meeting_id IN (${inList(meetingIds.length)}) ORDER BY team NULLS LAST, id`, ...meetingIds),
  );
}

export async function volunteersFor(meetingIds: number[]) {
  if (meetingIds.length === 0) return new Map<number, Volunteer[]>();
  return byMeeting(await all<Volunteer>(`SELECT * FROM volunteers WHERE meeting_id IN (${inList(meetingIds.length)}) ORDER BY created_at`, ...meetingIds));
}

/** Whether a student can fill a slot: anyone for a whole-team slot, otherwise on that subteam or team. */
export function fitsSlot(slot: Pick<VolunteerSlot, "team">, member: Pick<Member, "subteam" | "teams">) {
  return slot.team === null || member.subteam === slot.team || member.teams.includes(slot.team);
}

/** Spots still open in each slot: volunteers who later said they can't come free theirs again. */
export async function openSpots(meetingId: number, slots: VolunteerSlot[], volunteers: Volunteer[]) {
  const cantCome = new Set(
    (await all<{ user_id: number }>("SELECT user_id FROM rsvps WHERE meeting_id = ? AND response = 'no'", meetingId)).map((r) => r.user_id),
  );
  return new Map(
    slots.map((s) => [s.id, Math.max(0, s.wanted - volunteers.filter((v) => v.team === s.team && !cantCome.has(v.user_id)).length)]),
  );
}

/** The slot a student would fill: their own team's first, then anyone. Null when nothing open fits. */
export function pickSlot(member: Pick<Member, "subteam" | "teams">, slots: VolunteerSlot[], open: Map<number, number>) {
  const fitting = slots.filter((s) => fitsSlot(s, member) && (open.get(s.id) ?? 0) > 0);
  return fitting.find((s) => s.team !== null) ?? fitting[0] ?? null;
}

/** Upcoming one-off meetings that ask for volunteers. */
export function volunteerMeetings(fromDate = today()) {
  return all<Meeting>(
    `SELECT * FROM meetings m
      WHERE m.schedule_id IS NULL AND m.cancelled = 0 AND m.date >= ?
        AND EXISTS (SELECT 1 FROM volunteer_slots s WHERE s.meeting_id = m.id)
      ORDER BY m.date, m.start_time`,
    fromDate,
  );
}

/** Students who could still fill an open spot: not expected already, not volunteering, on a fitting team. */
export function askable(m: Meeting, students: Member[], slots: VolunteerSlot[], volunteers: Volunteer[], open: Map<number, number>) {
  const audience = parseAudience(m.audience);
  const taken = new Set(volunteers.map((v) => v.user_id));
  return students.filter((s) => !taken.has(s.id) && !inAudience(audience, s) && !!pickSlot(s, slots, open));
}

const HOUR = 3_600_000;

/** Sends each meeting's volunteer request once, and again `volunteer_reask_hours` later if spots are open. */
export async function sendVolunteerAsks(now = new Date()) {
  const meetings = (await volunteerMeetings()).filter((m) => meetingWindow(m).start > now);
  if (meetings.length === 0) return;
  const students = await listStudents();
  const slotMap = await slotsFor(meetings.map((m) => m.id));
  const volunteerMap = await volunteersFor(meetings.map((m) => m.id));

  for (const m of meetings) {
    const again = !!m.volunteer_ask_at;
    const reaskDue =
      again && !!m.volunteer_reask_hours && !m.volunteer_reask_at && now.getTime() >= Date.parse(m.volunteer_ask_at!) + m.volunteer_reask_hours * HOUR;
    if (again && !reaskDue) continue;

    // Claim the step first so two ticks can't both send.
    const step = again ? "volunteer_reask_at" : "volunteer_ask_at";
    if ((await run(`UPDATE meetings SET ${step} = ? WHERE id = ? AND ${step} IS NULL`, now.toISOString(), m.id)).changes === 0) continue;

    const slots = slotMap.get(m.id) ?? [];
    const volunteers = volunteerMap.get(m.id) ?? [];
    const open = await openSpots(m.id, slots, volunteers);
    const spots = [...open.values()].reduce((a, b) => a + b, 0);
    const to = askable(m, students, slots, volunteers, open).map((s) => s.id);
    if (spots === 0 || to.length === 0) continue;

    const { start, end } = meetingWindow(m);
    const sent = await pushToUsers(to, {
      title: again ? `Still need volunteers: ${m.title}` : `Volunteers needed: ${m.title}`,
      body: `${relativeDay(m.date)} ${fmtTime(start)}–${fmtTime(end)}. ${spots} spot${spots === 1 ? "" : "s"} ${again ? "still " : ""}open. Tap to volunteer.`,
      url: "/",
      tag: `volunteer-${m.id}`,
    }).catch((err) => {
      console.error("[orbit] volunteer request push failed", err);
      return 0;
    });
    console.info(`[orbit] volunteer ${again ? "re-ask" : "ask"} for meeting ${m.id}: ${to.length} students, sent to ${sent} devices`);
  }
}

/**
 * The volunteer requests a student can answer: upcoming meetings they aren't expected at or already
 * volunteering for, with the open slots that fit them.
 */
export async function requestsFor(member: Member, now = new Date()) {
  const meetings = (await volunteerMeetings()).filter((m) => meetingWindow(m).start > now && !inAudience(parseAudience(m.audience), member));
  const slotMap = await slotsFor(meetings.map((m) => m.id));
  const volunteerMap = await volunteersFor(meetings.map((m) => m.id));
  const out: { meeting: Meeting; open: { slot: VolunteerSlot; left: number }[] }[] = [];
  for (const m of meetings) {
    const volunteers = volunteerMap.get(m.id) ?? [];
    if (volunteers.some((v) => v.user_id === member.id)) continue;
    const slots = slotMap.get(m.id) ?? [];
    const open = await openSpots(m.id, slots, volunteers);
    const fitting = slots.filter((s) => fitsSlot(s, member) && (open.get(s.id) ?? 0) > 0).map((slot) => ({ slot, left: open.get(slot.id)! }));
    if (fitting.length) out.push({ meeting: m, open: fitting });
  }
  return out;
}

/** The meetings a student volunteered for (they're expected there). */
export async function volunteeredMeetingIds(userId: number) {
  return new Set((await all<{ meeting_id: number }>("SELECT meeting_id FROM volunteers WHERE user_id = ?", userId)).map((v) => v.meeting_id));
}
