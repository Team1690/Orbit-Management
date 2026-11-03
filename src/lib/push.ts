import webpush from "web-push";
import { all, run } from "./db";
import { getSettings, setSetting } from "./settings";

// Web Push: notifications on captains' phones (installed app on iPhone, any browser on Android).

export type PushPayload = { title: string; body: string; url: string; tag?: string };

function vapidKeys() {
  const s = getSettings();
  if (s.vapid_public && s.vapid_private) return { publicKey: s.vapid_public, privateKey: s.vapid_private };
  const keys = webpush.generateVAPIDKeys();
  setSetting("vapid_public", keys.publicKey);
  setSetting("vapid_private", keys.privateKey);
  return keys;
}

export function vapidPublicKey() {
  return vapidKeys().publicKey;
}

function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  if (process.env.APP_URL?.startsWith("https://")) return process.env.APP_URL;
  return "mailto:orbit-management@example.com";
}

export function saveSubscription(userId: number, sub: { endpoint: string; p256dh: string; auth: string }) {
  run(
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
  const subs = all<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN users u ON u.id = s.user_id
      WHERE u.role = 'captain' AND u.active = 1`,
  );
  if (subs.length === 0) return 0;
  const vapidDetails = { subject: vapidSubject(), ...vapidKeys() };
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
        if (status === 404 || status === 410) run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
        else console.error("[orbit] push failed", status, err);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
