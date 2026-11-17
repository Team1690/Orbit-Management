import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { fmtTime } from "./format";
import { meetingWindow, meetingsOn } from "./meetings";
import { pushToCaptains } from "./push";
import { getSettings } from "./settings";
import { localParts, zonedToUtc } from "./timeutil";

export type Alert = { id: number; kind: string; meeting_id: number | null; title: string; body: string; created_at: string };

export async function alertsToday() {
  const { timezone } = await getSettings();
  const start = zonedToUtc(localParts(new Date(), timezone).date, "00:00", timezone);
  return all<Alert>("SELECT * FROM alerts WHERE created_at >= ? ORDER BY created_at DESC", start.toISOString());
}

export function nameList(names: string[]) {
  return names.length <= 12 ? names.join(", ") : `${names.slice(0, 12).join(", ")} and ${names.length - 12} more`;
}

/**
 * `missing_alert_min` minutes after each required meeting starts, tells captains who hasn't
 * checked in yet (in the app, and as a push notification). Sent once per meeting.
 */
export async function checkMissingAlerts(now = new Date()) {
  const { missing_alert_min, timezone } = await getSettings();
  for (const m of await meetingsOn(localParts(now, timezone).date)) {
    // Meetings without check-in have nobody to miss.
    if (!m.mandatory || m.no_checkin || m.missing_alert_at) continue;
    const { start, end } = meetingWindow(m);
    if (now.getTime() < start.getTime() + missing_alert_min * 60_000 || now >= end) continue;
    // Claim the meeting first so two ticks can't both send.
    const claim = await run("UPDATE meetings SET missing_alert_at = ? WHERE id = ? AND missing_alert_at IS NULL", now.toISOString(), m.id);
    if (claim.changes === 0) continue;

    const rows = [...((await computeAttendance([m])).get(m.id) ?? new Map())];
    const names = new Map((await all<{ id: number; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
    const name = (id: number) => names.get(id) ?? "?";
    const missing = rows.filter(([, e]) => e.status === "missing");
    // Those who said in advance they can't come or will be late aren't expected yet, so they're left out.
    const noNotice = missing.filter(([, e]) => !e.notice).map(([id]) => name(id));
    const expected = rows.filter(([, e]) => !(e.status === "missing" && e.notice)).length;
    const late = rows
      .filter(([, e]) => e.status === "late" && e.firstIn)
      .map(([id, e]) => `${name(id)} (${fmtTime(e.firstIn!)})`);

    const title = noNotice.length
      ? `${noNotice.length} not checked in · ${m.title} ${fmtTime(start)}`
      : `Everyone expected checked in · ${m.title} ${fmtTime(start)}`;
    const parts = [noNotice.length && `Not here, no notice: ${nameList(noNotice)}.`, late.length && `Late: ${nameList(late)}.`].filter(Boolean);
    const body = parts.join(" ") || `All ${expected} expected students are here.`;

    await run("INSERT INTO alerts (kind, meeting_id, title, body, created_at) VALUES ('missing', ?, ?, ?, ?)", m.id, title, body, now.toISOString());
    // Awaited: a serverless host may pause the server as soon as the request that ran this tick ends.
    await pushToCaptains({ title, body, url: `/meetings/${m.id}`, tag: `missing-${m.id}` }).catch((err) =>
      console.error("[orbit] missing-members push failed", err),
    );
  }
}
