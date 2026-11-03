import { all } from "./db";
import { meetingWindow, rsvpsFor, type Meeting, type Rsvp } from "./meetings";
import { getSettings } from "./settings";
import { type Visit } from "./visits";

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
type Member = { id: number; created_at: string };

function inList(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}

/** Attendance for each meeting × active student (not mentors) who had joined by the meeting. */
export function computeAttendance(meetings: Meeting[], memberIds?: number[]) {
  const result = new Map<number, Map<number, AttendanceEntry>>();
  if (meetings.length === 0) return result;

  const now = Date.now();
  const graceMs = getSettings().late_grace_min * 60_000;
  const windows = new Map(meetings.map((m) => [m.id, meetingWindow(m)]));
  const minStart = Math.min(...[...windows.values()].map((w) => w.start.getTime()));
  const maxEnd = Math.max(...[...windows.values()].map((w) => w.end.getTime()));
  const ids = meetings.map((m) => m.id);

  const members = memberIds
    ? all<Member>(`SELECT id, created_at FROM users WHERE active = 1 AND role <> 'mentor' AND id IN (${inList(memberIds.length)})`, ...memberIds)
    : all<Member>("SELECT id, created_at FROM users WHERE active = 1 AND role <> 'mentor'");

  const visitsByUser = new Map<number, Visit[]>();
  for (const v of all<Visit>(
    "SELECT * FROM visits WHERE check_in < ? AND (check_out IS NULL OR check_out > ?)",
    new Date(maxEnd).toISOString(),
    new Date(minStart).toISOString(),
  )) {
    const list = visitsByUser.get(v.user_id) ?? [];
    list.push(v);
    visitsByUser.set(v.user_id, list);
  }

  const rsvps = new Map(rsvpsFor(ids).map((r) => [`${r.meeting_id}:${r.user_id}`, r]));
  const overrides = new Map(
    all<Override>(`SELECT * FROM attendance_overrides WHERE meeting_id IN (${inList(ids.length)})`, ...ids).map((o) => [
      `${o.meeting_id}:${o.user_id}`,
      o,
    ]),
  );

  for (const m of meetings) {
    const { start, end } = windows.get(m.id)!;
    const row = new Map<number, AttendanceEntry>();
    for (const member of members) {
      if (Date.parse(member.created_at) > end.getTime()) continue;
      const key = `${m.id}:${member.id}`;
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
      } else if (now < start.getTime()) {
        status = "upcoming";
      } else if (now < end.getTime()) {
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

/** Per-member totals over finished, mandatory, non-cancelled meetings. */
export function summarize(meetings: Meeting[], memberIds?: number[]) {
  const now = Date.now();
  const finished = meetings.filter((m) => m.mandatory && !m.cancelled && meetingWindow(m).end.getTime() <= now);
  const attendance = computeAttendance(finished, memberIds);
  const totals = new Map<number, AttendanceSummary>();
  for (const row of attendance.values()) {
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
