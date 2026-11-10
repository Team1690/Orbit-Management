"use server";

import { revalidatePath } from "next/cache";
import { applyAbsence, removeAbsence, type Absence } from "@/lib/absences";
import { requireUser } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { DATE_RE, str, type FormState } from "@/lib/forms";
import { today } from "@/lib/periods";
import { addDays } from "@/lib/timeutil";

/** A student's planned absence: every meeting in the range is answered "Can't come" with the reason. */
export async function addAbsence(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role === "mentor") return { error: "Mentors mark the days they can't come on the Mentors page." };
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  const reason = str(fd, "reason").slice(0, 200);
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { error: "Pick the first and last day you'll be away." };
  if (end < start) return { error: "The last day can't be before the first." };
  if (end < today()) return { error: "Those dates are already over." };
  if (end > addDays(start, 120)) return { error: "Add at most four months at a time." };
  if (!reason) return { error: "Write a short reason, like you would for Can't come." };

  const createdAt = new Date().toISOString();
  const { id } = await run(
    "INSERT INTO absences (user_id, start_date, end_date, reason, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    user.id,
    start,
    end,
    reason,
    createdAt,
  );
  const answered = await applyAbsence({ id, user_id: user.id, start_date: start, end_date: end, reason, created_at: createdAt }, true);
  revalidatePath("/", "layout");
  return {
    message: answered
      ? `Saved. You're marked "Can't come" for ${answered} meeting${answered === 1 ? "" : "s"}, and for any added in those dates.`
      : `Saved. Meetings in those dates will be answered "Can't come" for you.`,
  };
}

export async function deleteAbsence(fd: FormData) {
  const user = await requireUser();
  const a = await one<Absence>("SELECT * FROM absences WHERE id = ? AND user_id = ?", Number(fd.get("id")), user.id);
  if (a) await removeAbsence(a);
  revalidatePath("/", "layout");
}
