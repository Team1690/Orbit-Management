"use server";

import { requireCaptain } from "@/lib/auth";
import { run } from "@/lib/db";
import { pushToCaptains, saveSubscription } from "@/lib/push";

type SubscriptionJSON = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscription(sub: SubscriptionJSON) {
  const me = await requireCaptain();
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) return { ok: false };
  saveSubscription(me.id, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const me = await requireCaptain();
  run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", endpoint, me.id);
}

export async function sendTestPush() {
  const me = await requireCaptain();
  const sent = await pushToCaptains({
    title: "Test alert",
    body: `${me.name} sent a test. Alerts are working on this device.`,
    url: "/dashboard",
    tag: "test",
  });
  return { sent };
}
