import { computeAttendance } from "./attendance";
import { all, run } from "./db";
import { fmtDate, fmtTime } from "./format";
import { lateByLabel } from "./late-by";
import { meetingWindow, meetingsBetween, type Meeting } from "./meetings";
import { getSettings } from "./settings";
import { addDays, localParts } from "./timeutil";

// Slack: `slack_lead_hours` before each meeting with RSVPs, posts who can't come and who will be
// late to a channel through an incoming webhook (set up in Settings). Reasons stay in the app:
// a Slack channel is more public than the captains' dashboard.

/** Slack's own webhook addresses only, so the server can't be pointed at anything else. */
export function isSlackWebhook(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname === "hooks.slack.com") return true;
    // A local test server while developing.
    return process.env.NODE_ENV !== "production" && u.protocol === "http:" && u.hostname === "localhost";
  } catch {
    return false;
  }
}

export async function postToSlack(url: string, text: string) {
  if (!isSlackWebhook(url)) throw new Error("Not a Slack webhook address");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Slack answered ${res.status}: ${await res.text()}`);
}

/** Slack treats &, < and > as markup. */
function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function summaryText(m: Meeting) {
  const { start, end } = meetingWindow(m);
  const rows = [...((await computeAttendance([m])).get(m.id) ?? new Map())];
  const names = new Map((await all<{ id: number; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
  const byName = (a: number, b: number) => (names.get(a) ?? "").localeCompare(names.get(b) ?? "");
  const no = rows.filter(([, e]) => e.rsvp?.response === "no").map(([id]) => id).sort(byName);
  const late = rows.filter(([, e]) => e.rsvp?.response === "late").sort(([a], [b]) => byName(a, b));
  const coming = rows.filter(([, e]) => e.rsvp?.response === "yes").length;
  const noAnswer = rows.filter(([, e]) => !e.rsvp).length;

  const lines = [`*${escape(m.title)}* · ${fmtDate(m.date)}, ${fmtTime(start)}–${fmtTime(end)}`];
  lines.push(no.length ? `:x: *Can't come (${no.length}):* ${no.map((id) => escape(names.get(id) ?? "?")).join(", ")}` : ":x: *Can't come:* nobody");
  lines.push(
    late.length
      ? `:clock3: *Coming late (${late.length}):* ${late
          .map(([id, e]) => `${escape(names.get(id) ?? "?")}${e.rsvp?.late_by_min ? ` (${lateByLabel(e.rsvp.late_by_min).toLowerCase()})` : ""}`)
          .join(", ")}`
      : ":clock3: *Coming late:* nobody",
  );
  lines.push(`:white_check_mark: Coming on time: ${coming} · No answer yet: ${noAnswer}`);
  return lines.join("\n");
}

/** Posts each upcoming meeting's summary once, `slack_lead_hours` before it starts. Called every minute. */
export async function sendMeetingSummaries(now = new Date()) {
  const { slack_webhook_url, slack_lead_hours, timezone } = await getSettings();
  if (!slack_webhook_url) return;
  const leadMs = slack_lead_hours * 3_600_000;
  const today = localParts(now, timezone).date;
  for (const m of await meetingsBetween(today, addDays(today, Math.ceil(slack_lead_hours / 24) + 1), false)) {
    if (!m.rsvp || m.slack_sent_at) continue;
    const { start } = meetingWindow(m);
    if (now >= start || now.getTime() < start.getTime() - leadMs) continue;
    // Claim the meeting first so two ticks can't both send.
    const claim = await run("UPDATE meetings SET slack_sent_at = ? WHERE id = ? AND slack_sent_at IS NULL", now.toISOString(), m.id);
    if (claim.changes === 0) continue;
    try {
      await postToSlack(slack_webhook_url, await summaryText(m));
    } catch (err) {
      // Try again on the next tick (until the meeting starts).
      await run("UPDATE meetings SET slack_sent_at = NULL WHERE id = ?", m.id);
      console.error("[orbit] Slack summary failed", err);
    }
  }
}
