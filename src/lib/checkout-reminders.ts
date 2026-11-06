import { all, run } from "./db";
import { fmtTime } from "./format";
import { meetingWindow, meetingsOn } from "./meetings";
import { pushToUsers } from "./push";
import { getSettings } from "./settings";
import { localParts } from "./timeutil";

// `checkout_reminder_min` minutes after each meeting ends, everyone who checked in before the end
// and is still checked in gets "Time to check out". Sent once per meeting, claimed in
// meetings.checkout_reminder_at; called every minute. The automatic check-out still closes anything
// left open at the end of the day.

export async function sendCheckoutReminders(now = new Date()) {
  const { checkout_reminder_min, timezone } = await getSettings();
  if (checkout_reminder_min <= 0) return;
  for (const m of await meetingsOn(localParts(now, timezone).date)) {
    if (m.checkout_reminder_at) continue;
    const { end } = meetingWindow(m);
    if (now.getTime() < end.getTime() + checkout_reminder_min * 60_000) continue;
    if ((await run("UPDATE meetings SET checkout_reminder_at = ? WHERE id = ? AND checkout_reminder_at IS NULL", now.toISOString(), m.id)).changes === 0) {
      continue;
    }

    const stillIn = (
      await all<{ user_id: number }>("SELECT DISTINCT user_id FROM visits WHERE check_out IS NULL AND check_in < ?", end.toISOString())
    ).map((v) => v.user_id);
    if (stillIn.length === 0) continue;
    const sent = await pushToUsers(stillIn, {
      title: "Still checked in?",
      body: `${m.title} ended at ${fmtTime(end)}. Tap to check out.`,
      url: "/",
      tag: `checkout-${m.id}`,
    }).catch((err) => {
      console.error("[orbit] check-out reminder push failed", err);
      return 0;
    });
    console.info(`[orbit] check-out reminder for meeting ${m.id}: ${stillIn.length} still checked in, sent to ${sent} devices`);
  }
}
