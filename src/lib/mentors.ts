import { all } from "./db";
import { addDays, weekdayOf } from "./timeutil";

// Mentors announce when they'll come: regular weekly slots, plus exceptions for a single
// date ("can't come this Tuesday", or an extra one-off visit).

export type MentorSlot = {
  id: number;
  user_id: number;
  name: string;
  subteam: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  note: string | null;
};

type MentorChange = {
  id: number;
  user_id: number;
  name: string;
  subteam: string | null;
  date: string;
  kind: "skip" | "extra";
  slot_id: number | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};

export type PlanEntry = {
  mentorId: number;
  name: string;
  subteam: string | null;
  start: string;
  end: string;
  note: string | null;
  kind: "weekly" | "extra";
  /** For weekly slots: the mentor said they can't come on this date. */
  skipped: boolean;
  slotId: number | null;
  /** The skip or extra-visit record, so it can be undone. */
  changeId: number | null;
};

export function listMentors() {
  return all<{ id: number; name: string; subteam: string | null }>(
    "SELECT id, name, subteam FROM users WHERE role = 'mentor' AND active = 1 ORDER BY name COLLATE NOCASE",
  );
}

export function mentorSlots(userId?: number) {
  return all<MentorSlot>(
    `SELECT s.id, s.user_id, u.name, u.subteam, s.weekday, s.start_time, s.end_time, s.note
       FROM mentor_slots s JOIN users u ON u.id = s.user_id
      WHERE u.role = 'mentor' AND u.active = 1 AND (? IS NULL OR s.user_id = ?)
      ORDER BY s.weekday, s.start_time, u.name`,
    userId ?? null,
    userId ?? null,
  );
}

/** Who is expected on each day from `fromDate` for `days` days, earliest first. */
export function mentorPlan(fromDate: string, days: number) {
  const toDate = addDays(fromDate, days - 1);
  const slots = mentorSlots();
  const changes = all<MentorChange>(
    `SELECT c.id, c.user_id, u.name, u.subteam, c.date, c.kind, c.slot_id, c.start_time, c.end_time, c.note
       FROM mentor_changes c JOIN users u ON u.id = c.user_id
      WHERE u.role = 'mentor' AND u.active = 1 AND c.date BETWEEN ? AND ?`,
    fromDate,
    toDate,
  );

  const plan: { date: string; entries: PlanEntry[] }[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    const entries: PlanEntry[] = [];
    for (const s of slots.filter((s) => s.weekday === weekdayOf(d))) {
      const skip = changes.find((c) => c.kind === "skip" && c.slot_id === s.id && c.date === d);
      entries.push({
        mentorId: s.user_id,
        name: s.name,
        subteam: s.subteam,
        start: s.start_time,
        end: s.end_time,
        note: skip?.note ?? s.note,
        kind: "weekly",
        skipped: !!skip,
        slotId: s.id,
        changeId: skip?.id ?? null,
      });
    }
    for (const c of changes.filter((c) => c.kind === "extra" && c.date === d)) {
      entries.push({
        mentorId: c.user_id,
        name: c.name,
        subteam: c.subteam,
        start: c.start_time ?? "",
        end: c.end_time ?? "",
        note: c.note,
        kind: "extra",
        skipped: false,
        slotId: null,
        changeId: c.id,
      });
    }
    entries.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    plan.push({ date: d, entries });
  }
  return plan;
}
