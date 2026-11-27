"use server";

import { revalidatePath } from "next/cache";
import { canCheckOutSelf, getUser, isStaff, requireStaff, requireUser, type SessionUser } from "@/lib/auth";
import { getMember } from "@/lib/members";
import { all, run } from "@/lib/db";
import { notifyExcused, notifyLeaveRequest } from "@/lib/leave-requests";
import { fmtTime } from "@/lib/format";
import { extractCode, verifyQrCode } from "@/lib/qr";
import { checkIn, checkOut, excuse, openVisit } from "@/lib/visits";

export type ScanResult = { ok: boolean; message: string };

/** Called by the in-app scanner with whatever text the QR code contained. */
export async function checkInWithScan(scanned: string): Promise<ScanResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: "You're logged out. Log in and scan again." };
  const code = extractCode(scanned);
  if (!code || !(await verifyQrCode(code))) {
    return { ok: false, message: "That code isn't valid or has expired. Scan the code on the screen again." };
  }
  const { visit, already } = await checkIn(user.id, "qr");
  revalidatePath("/", "layout");
  return already
    ? { ok: true, message: `You're already checked in (since ${fmtTime(visit.check_in)}).` }
    : { ok: true, message: `Checked in at ${fmtTime(visit.check_in)}. Have a great meeting!` };
}

/** Mentors check in with one tap, without scanning the QR code. */
export async function mentorCheckIn() {
  const user = await requireUser();
  if (user.role !== "mentor") return;
  await checkIn(user.id, "self");
  revalidatePath("/", "layout");
}

export async function checkOutSelf() {
  const user = await requireUser();
  if (!canCheckOutSelf(user)) return;
  await checkOut(user.id, "self");
  revalidatePath("/", "layout");
}

/** Captains and lead mentors can check out (and excuse) anyone; a subteam lead, students on their own subteam. */
async function canCheckOut(user: SessionUser, targetId: number) {
  if (isStaff(user)) return true;
  if (user.role !== "member" || !user.subteam_lead) return false;
  const [lead, target] = await Promise.all([getMember(user.id), getMember(targetId)]);
  return !!lead?.subteam && !!target && target.role !== "mentor" && target.subteam === lead.subteam;
}

/** A subteam lead checks out someone on their own subteam (captains and lead mentors can check out anyone). */
export async function leadCheckOut(fd: FormData) {
  const user = await requireUser();
  const userId = Number(fd.get("user_id"));
  if (!userId || !(await canCheckOut(user, userId))) return;
  await checkOut(userId, "manual");
  revalidatePath("/", "layout");
}

/** A member who can't check themselves out asks to be excused; their subteam lead gets a notification. */
export async function askToLeave() {
  const user = await requireUser();
  const visit = await openVisit(user.id);
  if (!visit || visit.excuse_requested_at) return;
  const asked = await run(
    "UPDATE visits SET excuse_requested_at = ? WHERE id = ? AND check_out IS NULL AND excuse_requested_at IS NULL",
    new Date().toISOString(),
    visit.id,
  );
  if (asked.changes > 0) await notifyLeaveRequest(user.id).catch((err) => console.error("[orbit] leave request push failed", err));
  revalidatePath("/", "layout");
}

export async function cancelLeaveRequest() {
  const user = await requireUser();
  await run("UPDATE visits SET excuse_requested_at = NULL WHERE user_id = ? AND check_out IS NULL", user.id);
  revalidatePath("/", "layout");
}

/** One tap from a subteam lead, lead mentor or captain: excused, checked out at the time they asked. */
export async function excuseMember(fd: FormData) {
  const user = await requireUser();
  const userId = Number(fd.get("user_id"));
  if (!userId || !(await canCheckOut(user, userId))) return;
  if (await excuse(userId, user.id)) await notifyExcused(userId, user.name).catch((err) => console.error("[orbit] excused push failed", err));
  revalidatePath("/", "layout");
}

export async function captainCheckIn(fd: FormData) {
  await requireStaff();
  const userId = Number(fd.get("user_id"));
  if (userId) await checkIn(userId, "manual");
  revalidatePath("/", "layout");
}

export async function captainCheckOut(fd: FormData) {
  await requireStaff();
  const userId = Number(fd.get("user_id"));
  if (userId) await checkOut(userId, "manual");
  revalidatePath("/", "layout");
}

export async function checkOutEveryone() {
  const me = await requireStaff();
  const open = await all<{ user_id: number; excuse_requested_at: string | null }>("SELECT user_id, excuse_requested_at FROM visits WHERE check_out IS NULL");
  for (const { user_id, excuse_requested_at } of open) {
    // Anyone who asked to leave is excused as of the time they asked.
    if (excuse_requested_at) await excuse(user_id, me.id);
    else await checkOut(user_id, "manual");
  }
  revalidatePath("/", "layout");
}
