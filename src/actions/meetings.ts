"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCaptain } from "@/lib/auth";
import { one, run, tx } from "@/lib/db";
import { DATE_RE, TIME_RE, bool, int, optStr, str, type FormState } from "@/lib/forms";
import { LATE_BY_OPTIONS } from "@/lib/late-by";
import { readAudience } from "@/lib/audience";
import { ensureScheduledMeetings, setRsvp, type RsvpResponse } from "@/lib/meetings";
import { EXTRA_TEAMS, SUBTEAMS } from "@/lib/members";
import { today } from "@/lib/periods";
import { sendRsvpNotifications } from "@/lib/rsvp-reminders";

/** The teams a meeting can be limited to. */
const AUDIENCE_TEAMS = [...SUBTEAMS, ...EXTRA_TEAMS];

/** The optional "Reminder (hours before)" field: null when empty, "invalid" outside 1–168 (a week). */
function readReminder(fd: FormData) {
  if (!str(fd, "reminder_hours")) return null;
  const hours = int(fd, "reminder_hours");
  return hours !== null && hours >= 1 && hours <= 168 ? hours : "invalid";
}
const REMINDER_ERROR = "Set the reminder 1–168 hours before the meeting, or leave it empty.";

function readMeeting(fd: FormData) {
  const title = str(fd, "title") || "Team meeting";
  const date = str(fd, "date");
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  if (!DATE_RE.test(date)) return { error: "Pick a date." } as const;
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { error: "Enter start and end times." } as const;
  if (end <= start) return { error: "The meeting must end after it starts." } as const;
  const reminderHours = readReminder(fd);
  if (reminderHours === "invalid") return { error: REMINDER_ERROR } as const;
  return {
    title,
    date,
    start,
    end,
    mandatory: bool(fd, "mandatory"),
    rsvp: bool(fd, "rsvp"),
    notes: optStr(fd, "notes"),
    audience: readAudience(fd, AUDIENCE_TEAMS),
    reminderHours,
  };
}

export async function createMeeting(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const m = readMeeting(fd);
  if ("error" in m) return { error: m.error };
  const { id } = await run(
    "INSERT INTO meetings (title, date, start_time, end_time, mandatory, rsvp, notes, audience, reminder_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    m.title,
    m.date,
    m.start,
    m.end,
    m.mandatory,
    m.rsvp,
    m.notes,
    m.audience,
    m.reminderHours,
  );
  // One-off meetings take answers right away: send "Will you come?" now rather than on the next tick.
  await sendRsvpNotifications().catch((err) => console.error("[orbit] RSVP notifications failed", err));
  revalidatePath("/", "layout");
  redirect(`/meetings/${id}`);
}

export async function updateMeeting(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const m = readMeeting(fd);
  if ("error" in m) return { error: m.error };
  await run(
    `UPDATE meetings SET title = ?, date = ?, start_time = ?, end_time = ?, mandatory = ?, rsvp = ?, notes = ?, audience = ?,
       -- A new reminder time or a moved meeting gets its reminder again.
       reminder_sent_at = CASE WHEN reminder_hours IS DISTINCT FROM ?::int OR date <> ? OR start_time <> ? THEN NULL ELSE reminder_sent_at END,
       reminder_hours = ?
     WHERE id = ?`,
    m.title,
    m.date,
    m.start,
    m.end,
    m.mandatory,
    m.rsvp,
    m.notes,
    m.audience,
    m.reminderHours,
    m.date,
    m.start,
    m.reminderHours,
    id,
  );
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function setCancelled(fd: FormData) {
  await requireCaptain();
  await run("UPDATE meetings SET cancelled = ? WHERE id = ?", fd.get("cancelled") === "1", Number(fd.get("id")));
  revalidatePath("/", "layout");
}

export async function deleteMeeting(fd: FormData) {
  await requireCaptain();
  await run("DELETE FROM meetings WHERE id = ?", Number(fd.get("id")));
  revalidatePath("/", "layout");
  redirect("/meetings");
}

/** Sets a captain's attendance override for one member, or clears it ("auto"). */
export async function setAttendance(fd: FormData) {
  const me = await requireCaptain();
  const meetingId = Number(fd.get("meeting_id"));
  const userId = Number(fd.get("user_id"));
  const status = str(fd, "status");
  if (status === "auto") {
    await run("DELETE FROM attendance_overrides WHERE meeting_id = ? AND user_id = ?", meetingId, userId);
  } else if (["present", "late", "absent"].includes(status)) {
    await run(
      `INSERT INTO attendance_overrides (meeting_id, user_id, status, notice, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(meeting_id, user_id) DO UPDATE SET status = excluded.status, notice = excluded.notice, note = excluded.note,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      meetingId,
      userId,
      status,
      status !== "present" && bool(fd, "notice"),
      optStr(fd, "note"),
      me.id,
      new Date().toISOString(),
    );
  }
  revalidatePath(`/meetings/${meetingId}`);
}

/**
 * A captain sets or clears a member's RSVP, at any time (also after the deadline or the meeting).
 * `answer` is "none", "yes", "no" or "late:<minutes>"; the member's own note is kept.
 */
export async function setMemberRsvp(fd: FormData) {
  const me = await requireCaptain();
  const meetingId = Number(fd.get("meeting_id"));
  const userId = Number(fd.get("user_id"));
  const [response, minutes] = str(fd, "answer").split(":");
  if (!Number.isSafeInteger(meetingId) || !Number.isSafeInteger(userId)) return;
  if (response === "none") {
    await run("DELETE FROM rsvps WHERE meeting_id = ? AND user_id = ?", meetingId, userId);
  } else {
    const lateBy = response === "late" ? Number(minutes) : null;
    if (!["yes", "late", "no"].includes(response) || (lateBy !== null && !LATE_BY_OPTIONS.includes(lateBy))) return;
    const current = await one<{ note: string | null }>("SELECT note FROM rsvps WHERE meeting_id = ? AND user_id = ?", meetingId, userId);
    await setRsvp(meetingId, userId, response as RsvpResponse, response === "yes" ? null : (current?.note ?? null), lateBy, me.id);
  }
  revalidatePath("/", "layout");
}

export async function addScheduleRule(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const weekday = Number(fd.get("weekday"));
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  const title = str(fd, "title") || "Team meeting";
  const appliesValue = str(fd, "applies");
  const applies = appliesValue === "in_season" || appliesValue === "off_season" ? appliesValue : "all";
  if (!(weekday >= 0 && weekday <= 6)) return { error: "Pick a day." };
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || end <= start) return { error: "Enter a start time and a later end time." };
  const reminderHours = readReminder(fd);
  if (reminderHours === "invalid") return { error: REMINDER_ERROR };
  await run(
    "INSERT INTO schedule (weekday, start_time, end_time, title, applies, audience, reminder_hours) VALUES (?, ?, ?, ?, ?, ?, ?)",
    weekday,
    start,
    end,
    title,
    applies,
    readAudience(fd, AUDIENCE_TEAMS),
    reminderHours,
  );
  await ensureScheduledMeetings();
  revalidatePath("/", "layout");
  return { message: "Added. Meetings for the next weeks were created." };
}

/** Changes who a weekly slot is for, including its meetings from today on. */
export async function setScheduleAudience(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const audience = readAudience(fd, AUDIENCE_TEAMS);
  await tx(async () => {
    await run("UPDATE schedule SET audience = ? WHERE id = ?", audience, id);
    await run("UPDATE meetings SET audience = ? WHERE schedule_id = ? AND date >= ?", audience, id, today());
  });
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/** Removes a weekly slot and its future meetings that nobody has answered yet. Past meetings stay. */
export async function deleteScheduleRule(fd: FormData) {
  await requireCaptain();
  const id = Number(fd.get("id"));
  await tx(async () => {
    await run(
      `DELETE FROM meetings WHERE schedule_id = ? AND date > ? AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.meeting_id = meetings.id)`,
      id,
      today(),
    );
    await run("DELETE FROM schedule WHERE id = ?", id);
  });
  revalidatePath("/", "layout");
}
