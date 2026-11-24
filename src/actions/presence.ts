"use server";

import { revalidatePath } from "next/cache";
import { canCheckOutSelf, getUser, isStaff, requireStaff, requireUser } from "@/lib/auth";
import { getMember } from "@/lib/members";
import { all } from "@/lib/db";
import { fmtTime } from "@/lib/format";
import { extractCode, verifyQrCode } from "@/lib/qr";
import { checkIn, checkOut } from "@/lib/visits";

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

/** A subteam lead checks out someone on their own subteam (captains and lead mentors can check out anyone). */
export async function leadCheckOut(fd: FormData) {
  const user = await requireUser();
  const userId = Number(fd.get("user_id"));
  if (!userId) return;
  if (!isStaff(user)) {
    if (user.role !== "member" || !user.subteam_lead) return;
    const [lead, target] = await Promise.all([getMember(user.id), getMember(userId)]);
    if (!lead?.subteam || !target || target.role === "mentor" || target.subteam !== lead.subteam) return;
  }
  await checkOut(userId, "manual");
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
  await requireStaff();
  for (const { user_id } of await all<{ user_id: number }>("SELECT user_id FROM visits WHERE check_out IS NULL")) {
    await checkOut(user_id, "manual");
  }
  revalidatePath("/", "layout");
}
