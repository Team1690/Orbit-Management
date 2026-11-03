"use server";

import { revalidatePath } from "next/cache";
import { requireCaptain } from "@/lib/auth";
import { run } from "@/lib/db";
import { DATE_RE, TIME_RE, int, str, type FormState } from "@/lib/forms";
import { randomToken } from "@/lib/password";
import { resyncSchedule } from "@/lib/meetings";
import { setSetting } from "@/lib/settings";
import { isValidTimeZone } from "@/lib/timeutil";

export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const teamName = str(fd, "team_name");
  const timezone = str(fd, "timezone");
  const grace = int(fd, "late_grace_min");
  const rsvpHours = int(fd, "rsvp_open_hours");
  const autoOut = str(fd, "auto_checkout_time");
  const daysAhead = int(fd, "schedule_days_ahead");
  const alertMin = int(fd, "missing_alert_min");
  const rotate = int(fd, "qr_rotate_min");

  if (!teamName) return { error: "Enter a team name." };
  if (!isValidTimeZone(timezone)) return { error: "Unknown time zone. Use a name like Asia/Jerusalem." };
  if (grace === null || grace < 0 || grace > 120) return { error: "Late grace must be 0–120 minutes." };
  if (alertMin === null || alertMin < 1 || alertMin > 120) return { error: "The missing-members alert must be 1–120 minutes after the start." };
  if (rsvpHours === null || rsvpHours < 1 || rsvpHours > 336) return { error: "RSVP window must be 1–336 hours." };
  if (!TIME_RE.test(autoOut)) return { error: "Auto check-out time must look like 23:00." };
  if (daysAhead === null || daysAhead < 7 || daysAhead > 90) return { error: "Plan meetings 7–90 days ahead." };
  if (rotate === null || rotate < 1 || rotate > 60) return { error: "The QR code must change every 1–60 minutes." };

  setSetting("team_name", teamName);
  setSetting("timezone", timezone);
  setSetting("late_grace_min", grace);
  setSetting("missing_alert_min", alertMin);
  setSetting("rsvp_open_hours", rsvpHours);
  setSetting("auto_checkout_time", autoOut);
  setSetting("schedule_days_ahead", daysAhead);
  setSetting("qr_rotate_min", rotate);
  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}

function readSeason(fd: FormData) {
  const name = str(fd, "name");
  const kind = str(fd, "kind") === "in_season" ? "in_season" : "off_season";
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  if (!name) return { error: "Name the season." } as const;
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) return { error: "Pick a start date and a later end date." } as const;
  return { name, kind, start, end };
}

export async function addSeason(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const s = readSeason(fd);
  if ("error" in s) return { error: s.error };
  run("INSERT INTO seasons (name, kind, start_date, end_date) VALUES (?, ?, ?, ?)", s.name, s.kind, s.start, s.end);
  resyncSchedule();
  revalidatePath("/", "layout");
  return { message: "Season added." };
}

export async function updateSeason(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const s = readSeason(fd);
  if ("error" in s) return { error: s.error };
  run("UPDATE seasons SET name = ?, kind = ?, start_date = ?, end_date = ? WHERE id = ?", s.name, s.kind, s.start, s.end, id);
  resyncSchedule();
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function deleteSeason(fd: FormData) {
  await requireCaptain();
  run("DELETE FROM seasons WHERE id = ?", Number(fd.get("id")));
  resyncSchedule();
  revalidatePath("/", "layout");
}

export async function regenerateDisplayKey() {
  await requireCaptain();
  setSetting("display_key", randomToken());
  revalidatePath("/settings");
}
