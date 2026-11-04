"use server";

import { revalidatePath } from "next/cache";
import { requireCaptain } from "@/lib/auth";
import { run } from "@/lib/db";
import { DATE_RE, TIME_RE, int, str, type FormState } from "@/lib/forms";
import { randomToken } from "@/lib/password";
import { resyncSchedule } from "@/lib/meetings";
import { getSettings, setSetting } from "@/lib/settings";
import { isSlackWebhook, postToSlack } from "@/lib/slack";
import { isValidTimeZone } from "@/lib/timeutil";

export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const teamName = str(fd, "team_name");
  const timezone = str(fd, "timezone");
  const grace = int(fd, "late_grace_min");
  const rsvpHours = int(fd, "rsvp_open_hours");
  const remindHours = int(fd, "rsvp_reminder_hours");
  const closeHours = int(fd, "rsvp_close_hours");
  const autoOut = str(fd, "auto_checkout_time");
  const daysAhead = int(fd, "schedule_days_ahead");
  const alertMin = int(fd, "missing_alert_min");
  const rotate = int(fd, "qr_rotate_min");
  const flagAbsences = int(fd, "flag_absences");
  const flagLates = int(fd, "flag_lates");

  if (!teamName) return { error: "Enter a team name." };
  if (!isValidTimeZone(timezone)) return { error: "Unknown time zone. Use a name like Asia/Jerusalem." };
  if (grace === null || grace < 0 || grace > 120) return { error: "Late grace must be 0–120 minutes." };
  if (alertMin === null || alertMin < 1 || alertMin > 120) return { error: "The missing-members alert must be 1–120 minutes after the start." };
  if (rsvpHours === null || rsvpHours < 1 || rsvpHours > 336) return { error: "RSVP window must be 1–336 hours." };
  if (remindHours === null || remindHours < 0 || remindHours >= rsvpHours) {
    return { error: `The reminder must be 0 (off) or fewer hours than the RSVP window (${rsvpHours}).` };
  }
  if (closeHours === null || closeHours < 0 || closeHours >= rsvpHours) {
    return { error: `Answers must close 0 (never) or fewer hours before than the RSVP window (${rsvpHours}).` };
  }
  if (remindHours > 0 && closeHours > 0 && remindHours <= closeHours) {
    return { error: "Send the reminder before answers close: more hours before the meeting." };
  }
  if (!TIME_RE.test(autoOut)) return { error: "Auto check-out time must look like 23:00." };
  if (daysAhead === null || daysAhead < 7 || daysAhead > 90) return { error: "Plan meetings 7–90 days ahead." };
  if (rotate === null || rotate < 1 || rotate > 60) return { error: "The QR code must change every 1–60 minutes." };
  if (flagAbsences === null || flagAbsences < 0 || flagAbsences > 30) return { error: "Absences to flag must be 0–30 (0 turns it off)." };
  if (flagLates === null || flagLates < 0 || flagLates > 30) return { error: "Late arrivals to flag must be 0–30 (0 turns it off)." };

  await setSetting("team_name", teamName);
  await setSetting("timezone", timezone);
  await setSetting("late_grace_min", grace);
  await setSetting("missing_alert_min", alertMin);
  await setSetting("rsvp_open_hours", rsvpHours);
  await setSetting("rsvp_reminder_hours", remindHours);
  await setSetting("rsvp_close_hours", closeHours);
  await setSetting("auto_checkout_time", autoOut);
  await setSetting("schedule_days_ahead", daysAhead);
  await setSetting("qr_rotate_min", rotate);
  await setSetting("flag_absences", flagAbsences);
  await setSetting("flag_lates", flagLates);
  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}

export async function saveSlack(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const url = str(fd, "slack_webhook_url");
  const hours = int(fd, "slack_lead_hours");
  if (url && !isSlackWebhook(url)) return { error: "That isn't a Slack webhook address. It starts with https://hooks.slack.com/" };
  if (hours === null || hours < 1 || hours > 24) return { error: "Send the summary 1–24 hours before the meeting." };
  await setSetting("slack_webhook_url", url);
  await setSetting("slack_lead_hours", hours);
  revalidatePath("/settings");
  return { message: url ? "Saved. Use “Send a test message” to check it." : "Saved. Slack messages are off." };
}

export async function sendSlackTest(): Promise<FormState> {
  await requireCaptain();
  const { slack_webhook_url, slack_lead_hours, team_name } = await getSettings();
  if (!slack_webhook_url) return { error: "Save a Slack webhook address first." };
  try {
    await postToSlack(
      slack_webhook_url,
      `:wave: ${team_name} is connected. ${slack_lead_hours} hours before each meeting, this channel gets a list of who can't come and who will be late.`,
    );
  } catch (err) {
    console.error("[orbit] Slack test failed", err);
    return { error: "Slack didn't accept the message. Check the webhook address." };
  }
  return { message: "Sent. Check the Slack channel." };
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
  await run("INSERT INTO seasons (name, kind, start_date, end_date) VALUES (?, ?, ?, ?)", s.name, s.kind, s.start, s.end);
  await resyncSchedule();
  revalidatePath("/", "layout");
  return { message: "Season added." };
}

export async function updateSeason(id: number, _: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const s = readSeason(fd);
  if ("error" in s) return { error: s.error };
  await run("UPDATE seasons SET name = ?, kind = ?, start_date = ?, end_date = ? WHERE id = ?", s.name, s.kind, s.start, s.end, id);
  await resyncSchedule();
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function deleteSeason(fd: FormData) {
  await requireCaptain();
  await run("DELETE FROM seasons WHERE id = ?", Number(fd.get("id")));
  await resyncSchedule();
  revalidatePath("/", "layout");
}

export async function regenerateDisplayKey() {
  await requireCaptain();
  await setSetting("display_key", randomToken());
  revalidatePath("/settings");
}
