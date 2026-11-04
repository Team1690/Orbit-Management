import webpush from "web-push";
import { all, run, tx } from "./db";
import { getSettings, setSetting } from "./settings";

// Web Push: notifications on phones (installed app on iPhone, any browser on Android). Captains get
// alerts; members get RSVP reminders.

export type PushPayload = { title: string; body: string; url: string; tag?: string };

async function vapidKeys() {
  const s = await getSettings();
  if (s.vapid_public && s.vapid_private) return { publicKey: s.vapid_public, privateKey: s.vapid_private };
  // In a transaction so two requests can't each save a different key pair.
  return tx(async () => {
    const again = await getSettings();
    if (again.vapid_public && again.vapid_private) return { publicKey: again.vapid_public, privateKey: again.vapid_private };
    const keys = webpush.generateVAPIDKeys();
    await setSetting("vapid_public", keys.publicKey);
    await setSetting("vapid_private", keys.privateKey);
    return keys;
  });
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (process.env.APP_URL?.startsWith("https://")) return process.env.APP_URL;
  return "mailto:orbit-management@example.com";
}

export async function saveSubscription(userId: number, sub: { endpoint: string; p256dh: string; auth: string }) {
  await run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    sub.endpoint,
    userId,
    sub.p256dh,
    sub.auth,
  );
}

/** Sends to every device where an active captain turned on alerts. Returns how many got it. */
export async function pushToCaptains(payload: PushPayload) {
  const captains = await all<{ id: number }>("SELECT id FROM users WHERE role = 'captain' AND active = 1");
  return pushToUsers(
    captains.map((c) => c.id),
    payload,
  );
}

/** Sends to every device where these users turned on notifications. Returns how many got it. */
export async function pushToUsers(userIds: number[], payload: PushPayload) {
  if (userIds.length === 0) return 0;
  const subs = await all<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    ...userIds,
  );
  if (subs.length === 0) return 0;
  const vapidDetails = { subject: vapidSubject(), ...(await vapidKeys()) };
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          TTL: 3600,
          urgency: "high",
          vapidDetails,
        });
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The device unsubscribed or the app was removed: forget it.
        if (status === 404 || status === 410) await run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
        else console.error("[orbit] push failed", status, err);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
