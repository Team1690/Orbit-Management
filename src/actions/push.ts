"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { pushToUsers, saveSubscription } from "@/lib/push";

type SubscriptionJSON = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

// Anyone can turn on notifications for their own devices: captains get alerts, members get RSVP reminders.

export async function savePushSubscription(sub: SubscriptionJSON) {
  const me = await requireUser();
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) return { ok: false };
  await saveSubscription(me.id, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const me = await requireUser();
  await run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", endpoint, me.id);
}

/** Lead mentors: turn the captains' alerts on or off (meeting reminders keep coming either way). */
export async function setStaffAlerts(fd: FormData) {
  const me = await requireUser();
  if (me.role !== "mentor" || !me.lead_mentor) return;
  await run("UPDATE users SET staff_alerts = ? WHERE id = ?", fd.get("on") === "1", me.id);
  revalidatePath("/profile");
}

/** Sends a test to the caller's own devices. */
export async function sendTestPush() {
  const me = await requireUser();
  const sent = await pushToUsers([me.id], {
    title: "Test notification",
    body: "Notifications from Orbit are working on this device.",
    url: me.role === "captain" ? "/dashboard" : "/",
    tag: "test",
  });
  return { sent };
}
