import { inAudience, parseAudience } from "./audience";
import { all } from "./db";
import { meetingWindow, rsvpsFor, type Meeting, type Rsvp } from "./meetings";
import { getSettings } from "./settings";
import { type Visit } from "./visits";

// Who is expected: the meeting's audience plus its volunteers (volunteers.ts).
// Attendance is derived, not stored: check-ins decide present/late/absent, an RSVP of
// "late" or "no" sent before the start counts as advance notice, and a captain's
// override wins over both.

export type AttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "upcoming" // meeting hasn't started
  | "missing" // meeting in progress, not here yet
  | "not_required"; // optional meeting, didn't come

export type AttendanceEntry = {
  status: AttendanceStatus;
  notice: boolean;
  firstIn: string | null;
  rsvp: Rsvp | null;
  overridden: boolean;
  overrideNote: string | null;
};

type Override = { meeting_id: number; user_id: number; status: "present" | "late" | "absent"; notice: number; note: string | null };
type Member = { id: number; created_at: string; subteam: string | null; teams: string | null };

/** Who each student is, for working out which meetings they're expected at. */
const MEMBER_COLUMNS = `id, created_at, subteam, (SELECT string_agg(team, '|') FROM member_teams t WHERE t.user_id = users.id) AS teams`;

function inList(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}

/** Attendance for each meeting × active student (not mentors) the meeting is for, who had joined by then. */
export async function computeAttendance(meetings: Meeting[], memberIds?: number[]) {
  const result = new Map<number, Map<number, AttendanceEntry>>();
  if (meetings.length === 0) return result;

  const now = Date.now();
  const graceMs = (await getSettings()).late_grace_min * 60_000;
  const windows = new Map(meetings.map((m) => [m.id, meetingWindow(m)]));
  const minStart = Math.min(...[...windows.values()].map((w) => w.start.getTime()));
  const maxEnd = Math.max(...[...windows.values()].map((w) => w.end.getTime()));
  const ids = meetings.map((m) => m.id);

  const members = memberIds?.length === 0 ? [] : memberIds
    ? await all<Member>(`SELECT ${MEMBER_COLUMNS} FROM users WHERE active = 1 AND role <> 'mentor' AND id IN (${inList(memberIds.length)})`, ...memberIds)
    : await all<Member>(`SELECT ${MEMBER_COLUMNS} FROM users WHERE active = 1 AND role <> 'mentor'`);
  const memberTeams = new Map(members.map((u) => [u.id, u.teams ? u.teams.split("|") : []]));

  const visitsByUser = new Map<number, Visit[]>();
  for (const v of await all<Visit>(
    "SELECT * FROM visits WHERE check_in < ? AND (check_out IS NULL OR check_out > ?)",
    new Date(maxEnd).toISOString(),
    new Date(minStart).toISOString(),
  )) {
    const list = visitsByUser.get(v.user_id) ?? [];
    list.push(v);
    visitsByUser.set(v.user_id, list);
  }

  const rsvps = new Map((await rsvpsFor(ids)).map((r) => [`${r.meeting_id}:${r.user_id}`, r]));
  const volunteered = new Set(
    (await all<{ meeting_id: number; user_id: number }>(`SELECT meeting_id, user_id FROM volunteers WHERE meeting_id IN (${inList(ids.length)})`, ...ids)).map(
      (v) => `${v.meeting_id}:${v.user_id}`,
    ),
  );
  const overrides = new Map(
    (await all<Override>(`SELECT * FROM attendance_overrides WHERE meeting_id IN (${inList(ids.length)})`, ...ids)).map((o) => [
      `${o.meeting_id}:${o.user_id}`,
      o,
    ]),
  );

  for (const m of meetings) {
    const { start, end } = windows.get(m.id)!;
    const audience = parseAudience(m.audience);
    const row = new Map<number, AttendanceEntry>();
    for (const member of members) {
      if (Date.parse(member.created_at) > end.getTime()) continue;
      const key = `${m.id}:${member.id}`;
      if (!volunteered.has(key) && !inAudience(audience, { id: member.id, subteam: member.subteam, teams: memberTeams.get(member.id)! })) continue;
      const rsvp = rsvps.get(key) ?? null;

      let firstIn: number | null = null;
      for (const v of visitsByUser.get(member.id) ?? []) {
        const vin = Date.parse(v.check_in);
        const vout = v.check_out ? Date.parse(v.check_out) : now;
        if (vin < end.getTime() && vout > start.getTime() && (firstIn === null || vin < firstIn)) firstIn = vin;
      }

      const override = overrides.get(key);
      let status: AttendanceStatus;
      let notice = !!rsvp && rsvp.response !== "yes" && rsvp.responded_at < start.toISOString();
      if (override) {
        status = override.status;
        notice = !!override.notice;
      } else if (firstIn !== null) {
        status = firstIn <= start.getTime() + graceMs ? "present" : "late";
      } else if (m.no_checkin && rsvp && rsvp.response !== "no" && now >= start.getTime()) {
        // A meeting without check-in: answering Coming or Late counts as being there.
        status = "present";
      } else if (now < start.getTime()) {
        status = "upcoming";
      } else if (now < end.getTime() && !m.no_checkin) {
        status = "missing";
      } else {
        status = m.mandatory ? "absent" : "not_required";
      }
      if (status === "present") notice = false;

      row.set(member.id, {
        status,
        notice,
        firstIn: firstIn === null ? null : new Date(firstIn).toISOString(),
        rsvp,
        overridden: !!override,
        overrideNote: override?.note ?? null,
      });
    }
    result.set(m.id, row);
  }
  return result;
}

export type AttendanceSummary = {
  meetings: number;
  present: number;
  late: number;
  lateNotice: number;
  absent: number;
  absentNotice: number;
  /** Said "coming" but didn't show and didn't update their RSVP. */
  noShows: number;
  /** (present + late) / meetings, or null when there were no meetings. */
  rate: number | null;
};

const emptySummary = (): AttendanceSummary => ({
  meetings: 0,
  present: 0,
  late: 0,
  lateNotice: 0,
  absent: 0,
  absentNotice: 0,
  noShows: 0,
  rate: null,
});

/** Whether a meeting counts toward attendance totals: finished, mandatory and not cancelled. */
export function countsTowardTotals(m: Meeting, now = Date.now()) {
  return !!m.mandatory && !m.cancelled && meetingWindow(m).end.getTime() <= now;
}

/** Per-member totals over finished, mandatory, non-cancelled meetings. */
export async function summarize(meetings: Meeting[], memberIds?: number[]) {
  const now = Date.now();
  const attendance = await computeAttendance(
    meetings.filter((m) => countsTowardTotals(m, now)),
    memberIds,
  );
  return totalsFrom(attendance.values());
}

/** Per-member totals from computeAttendance rows; pass only meetings that count (countsTowardTotals). */
export function totalsFrom(rows: Iterable<Map<number, AttendanceEntry>>) {
  const totals = new Map<number, AttendanceSummary>();
  for (const row of rows) {
    for (const [userId, e] of row) {
      const s = totals.get(userId) ?? emptySummary();
      s.meetings += 1;
      if (e.status === "present") s.present += 1;
      if (e.status === "late") {
        s.late += 1;
        if (e.notice) s.lateNotice += 1;
      }
      if (e.status === "absent") {
        s.absent += 1;
        if (e.notice) s.absentNotice += 1;
        else if (e.rsvp?.response === "yes") s.noShows += 1;
      }
      totals.set(userId, s);
    }
  }
  for (const s of totals.values()) s.rate = s.meetings ? (s.present + s.late) / s.meetings : null;
  return totals;
}

export function summaryFor(totals: Map<number, AttendanceSummary>, userId: number) {
  return totals.get(userId) ?? emptySummary();
}
