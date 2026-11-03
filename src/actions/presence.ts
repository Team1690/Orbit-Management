"use server";

import { revalidatePath } from "next/cache";
import { getUser, requireCaptain, requireUser } from "@/lib/auth";
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
  await checkOut(user.id, "self");
  revalidatePath("/", "layout");
}

export async function captainCheckIn(fd: FormData) {
  await requireCaptain();
  const userId = Number(fd.get("user_id"));
  if (userId) await checkIn(userId, "manual");
  revalidatePath("/", "layout");
}

export async function captainCheckOut(fd: FormData) {
  await requireCaptain();
  const userId = Number(fd.get("user_id"));
  if (userId) await checkOut(userId, "manual");
  revalidatePath("/", "layout");
}

export async function checkOutEveryone() {
  await requireCaptain();
  for (const { user_id } of await all<{ user_id: number }>("SELECT user_id FROM visits WHERE check_out IS NULL")) {
    await checkOut(user_id, "manual");
  }
  revalidatePath("/", "layout");
}
