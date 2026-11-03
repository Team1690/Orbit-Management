"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { one, run, tx } from "@/lib/db";
import { DATE_RE, TIME_RE, optStr, str, type FormState } from "@/lib/forms";
import { today } from "@/lib/periods";
import { weekdayOf } from "@/lib/timeutil";

async function requireMentor() {
  const user = await requireUser();
  if (user.role !== "mentor") throw new Error("Only mentors can change mentor schedules.");
  return user;
}

function readTimes(fd: FormData) {
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || end <= start) return null;
  return { start, end };
}

export async function addMentorSlot(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMentor();
  const weekday = Number(fd.get("weekday"));
  const times = readTimes(fd);
  if (!(weekday >= 0 && weekday <= 6)) return { error: "Pick a day." };
  if (!times) return { error: "Enter when you arrive and a later time you leave." };
  await run(
    "INSERT INTO mentor_slots (user_id, weekday, start_time, end_time, note) VALUES (?, ?, ?, ?, ?)",
    me.id,
    weekday,
    times.start,
    times.end,
    optStr(fd, "note")?.slice(0, 200),
  );
  revalidatePath("/", "layout");
  return { message: "Added to your weekly schedule." };
}

export async function removeMentorSlot(fd: FormData) {
  const me = await requireMentor();
  await run("DELETE FROM mentor_slots WHERE id = ? AND user_id = ?", Number(fd.get("id")), me.id);
  revalidatePath("/", "layout");
}

/** "Can't come" for one date of a weekly slot. */
export async function skipMentorSlot(fd: FormData) {
  const me = await requireMentor();
  const slotId = Number(fd.get("slot_id"));
  const date = str(fd, "date");
  const slot = await one<{ weekday: number }>("SELECT weekday FROM mentor_slots WHERE id = ? AND user_id = ?", slotId, me.id);
  if (!slot || !DATE_RE.test(date) || weekdayOf(date) !== slot.weekday || date < today()) return;
  await tx(async () => {
    if (!(await one("SELECT 1 FROM mentor_changes WHERE kind = 'skip' AND slot_id = ? AND date = ?", slotId, date))) {
      await run("INSERT INTO mentor_changes (user_id, date, kind, slot_id) VALUES (?, ?, 'skip', ?)", me.id, date, slotId);
    }
  });
  revalidatePath("/", "layout");
}

export async function addMentorVisit(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireMentor();
  const date = str(fd, "date");
  const times = readTimes(fd);
  if (!DATE_RE.test(date) || date < today()) return { error: "Pick today or a later date." };
  if (!times) return { error: "Enter when you arrive and a later time you leave." };
  await run(
    "INSERT INTO mentor_changes (user_id, date, kind, start_time, end_time, note) VALUES (?, ?, 'extra', ?, ?, ?)",
    me.id,
    date,
    times.start,
    times.end,
    optStr(fd, "note")?.slice(0, 200),
  );
  revalidatePath("/", "layout");
  return { message: "Added. Everyone can see it on the Mentors page." };
}

/** Undoes a "can't come" or removes a one-off visit. */
export async function removeMentorChange(fd: FormData) {
  const me = await requireMentor();
  await run("DELETE FROM mentor_changes WHERE id = ? AND user_id = ?", Number(fd.get("id")), me.id);
  revalidatePath("/", "layout");
}
