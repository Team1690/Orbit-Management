import { all, run } from "./db";
import { meetingWindow, meetingsOn } from "./meetings";
import { pushToCaptains, pushToUsers } from "./push";
import { getSettings } from "./settings";
import { localParts } from "./timeutil";

// Members don't check themselves out: captains, lead mentors and subteam leads do. For everyone still
// checked in after the day's last meeting ended (the "reference end"; for a visit on a day without a
// meeting, its check-in time):
//   every `checkout_remind_every_hours` hours: captains (and lead mentors with alerts on) get the list,
//                and each subteam lead gets their own subteam's part of it;
//   after `missed_checkout_hours` hours: the visit is closed at the reference end and marked 'missed'
//                ("left without checking out", shown on the member's page and the meeting sheet), and
//                the same people get that final list.
// visits.checkout_reminders counts the reminders already sent for a visit. Called every minute.

const HOUR = 3_600_000;

type OpenVisit = { id: number; user_id: number; check_in: string; checkout_reminders: number; name: string; role: string; subteam: string | null };

/** The end of the last meeting on the visit's day that ends after the check-in, or else the check-in itself. */
async function referenceEnds(visits: OpenVisit[], timezone: string) {
  const endsByDay = new Map<string, number[]>();
  const out = new Map<number, number>();
  for (const v of visits) {
    const checkIn = Date.parse(v.check_in);
    const day = localParts(new Date(checkIn), timezone).date;
    if (!endsByDay.has(day)) endsByDay.set(day, (await meetingsOn(day)).map((m) => meetingWindow(m).end.getTime()));
    const after = endsByDay.get(day)!.filter((end) => end > checkIn);
    out.set(v.id, after.length ? Math.max(...after) : checkIn);
  }
  return out;
}

/** Sends a list to captains, and to each subteam lead the part of it that is their own subteam (students only). */
async function notify(people: OpenVisit[], title: (n: number) => string, body: (names: string) => string, kind: string, now: Date) {
  const names = (list: OpenVisit[]) => list.map((p) => p.name).sort((a, b) => a.localeCompare(b)).join(", ");
  const t = title(people.length);
  const b = body(names(people));
  await run("INSERT INTO alerts (kind, title, body, created_at) VALUES (?, ?, ?, ?)", kind, t, b, now.toISOString());
  await pushToCaptains({ title: t, body: b, url: "/dashboard", tag: kind }).catch((err) => console.error(`[orbit] ${kind} push failed`, err));

  const bySubteam = new Map<string, OpenVisit[]>();
  for (const p of people) if (p.role !== "mentor" && p.subteam) bySubteam.set(p.subteam, [...(bySubteam.get(p.subteam) ?? []), p]);
  for (const [subteam, list] of bySubteam) {
    const leads = (
      await all<{ id: number }>("SELECT id FROM users WHERE active = 1 AND role = 'member' AND subteam_lead = 1 AND subteam = ?", subteam)
    ).map((u) => u.id);
    if (leads.length === 0) continue;
    await pushToUsers(leads, { title: `${subteam}: ${title(list.length)}`, body: body(names(list)), url: "/subteam", tag: `${kind}-${subteam}` }).catch((err) =>
      console.error(`[orbit] ${kind} push to subteam leads failed`, err),
    );
  }
}

export async function sendCheckoutFollowUps(now = new Date()) {
  const { checkout_remind_every_hours: every, missed_checkout_hours: missedAfter, timezone } = await getSettings();
  const open = await all<OpenVisit>(
    `SELECT v.id, v.user_id, v.check_in, v.checkout_reminders, u.name, u.role, u.subteam
       FROM visits v JOIN users u ON u.id = v.user_id WHERE v.check_out IS NULL`,
  );
  if (open.length === 0) return;
  const refs = await referenceEnds(open, timezone);

  const missed: OpenVisit[] = [];
  const remind: OpenVisit[] = [];
  for (const v of open) {
    const ref = refs.get(v.id)!;
    const elapsed = now.getTime() - ref;
    if (elapsed <= 0) continue;
    if (elapsed >= missedAfter * HOUR) {
      // Left without being checked out: credited until the meeting ended, and marked so.
      const closed = await run("UPDATE visits SET check_out = ?, out_method = 'missed' WHERE id = ? AND check_out IS NULL", new Date(ref).toISOString(), v.id);
      if (closed.changes > 0) missed.push(v);
    } else if (every > 0 && elapsed >= every * HOUR) {
      const due = Math.floor(elapsed / (every * HOUR));
      const claimed = await run("UPDATE visits SET checkout_reminders = ? WHERE id = ? AND checkout_reminders < ? AND check_out IS NULL", due, v.id, due);
      if (claimed.changes > 0) remind.push(v);
    }
  }

  if (remind.length) {
    await notify(
      remind,
      (n) => `${n} still checked in`,
      (names) => `The meeting is over. Check them out when they leave: ${names}.`,
      "checkout_reminder",
      now,
    );
  }
  if (missed.length) {
    await notify(
      missed,
      (n) => `${n} left without being checked out`,
      (names) => `${names}. Marked "left without checking out" and credited until the meeting ended.`,
      "missed_checkout",
      now,
    );
  }
  if (remind.length || missed.length) console.info(`[orbit] check-out follow-up: ${remind.length} reminded, ${missed.length} marked missed`);
}
