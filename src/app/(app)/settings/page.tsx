import type { Metadata } from "next";
import { headers } from "next/headers";
import { addSeason, deleteSeason, regenerateDisplayKey, saveSettings, saveSlack, sendSlackTest, updateSeason } from "@/actions/settings";
import { ActionForm, ConfirmButton, CopyField, SubmitButton } from "@/components/client";
import { PushToggle } from "@/components/push-toggle";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { requireCaptain } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { listSeasons, today } from "@/lib/periods";
import { vapidPublicKey } from "@/lib/push";
import { appOrigin } from "@/lib/qr";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireCaptain();
  const s = await getSettings();
  const seasons = await listSeasons();
  const t = today();
  const displayUrl = `${appOrigin(await headers())}/qr?k=${s.display_key}`;
  const publicKey = await vapidPublicKey();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" />

      <Card title="Team and attendance rules">
        <ActionForm action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <Field label="Team name">
            <input name="team_name" defaultValue={s.team_name} required className="input" />
          </Field>
          <Field label="Time zone">
            <input name="timezone" defaultValue={s.timezone} required className="input" />
          </Field>
          <Field label="Late after (minutes)" hint="Check-ins more than this long after the start count as late.">
            <input name="late_grace_min" type="number" min={0} max={120} defaultValue={s.late_grace_min} className="input" />
          </Field>
          <Field label="Missing-members alert (minutes after start)" hint="Captains get a list of everyone who hasn't checked in yet.">
            <input name="missing_alert_min" type="number" min={1} max={120} defaultValue={s.missing_alert_min} className="input" />
          </Field>
          <Field label="Ask for RSVPs (hours before)" hint="When the question appears on members' home screens.">
            <input name="rsvp_open_hours" type="number" min={1} max={336} defaultValue={s.rsvp_open_hours} className="input" />
          </Field>
          <Field label="Automatic check-out time" hint="Anyone still checked in is checked out at this time and credited until their meeting ended.">
            <input name="auto_checkout_time" type="time" defaultValue={s.auto_checkout_time} className="input" />
          </Field>
          <Field label="Create meetings (days ahead)">
            <input name="schedule_days_ahead" type="number" min={7} max={90} defaultValue={s.schedule_days_ahead} className="input" />
          </Field>
          <Field label="QR code changes every (minutes)" hint="A scan still works for 45 seconds after the code changes.">
            <input name="qr_rotate_min" type="number" min={1} max={60} defaultValue={s.qr_rotate_min} className="input" />
          </Field>
          <Field label="Flag after this many absences" hint="In the last 30 days, with or without notice. Shown under Needs attention. 0 turns it off.">
            <input name="flag_absences" type="number" min={0} max={30} defaultValue={s.flag_absences} className="input" />
          </Field>
          <Field label="Flag after this many late arrivals" hint="In the last 30 days. 0 turns it off.">
            <input name="flag_lates" type="number" min={0} max={30} defaultValue={s.flag_lates} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title="Alerts on this device">
        <p className="mb-3 text-sm text-slate-600">
          Get a notification {s.missing_alert_min} minutes after each meeting starts, listing everyone who hasn&apos;t checked in. Turn this on
          for each phone or computer you want alerts on. On iPhone it works in the app installed on the Home Screen.
        </p>
        <PushToggle publicKey={publicKey} />
      </Card>

      <Card title="Slack" actions={s.slack_webhook_url ? <Badge tone="green">Connected</Badge> : <Badge>Off</Badge>}>
        <p className="mb-3 text-sm text-slate-600">
          Before each meeting, post who can&apos;t come and who will be late (with how late) to a Slack channel. Reasons stay in the app. Paste the
          channel&apos;s incoming webhook address; the README explains how to create one.
        </p>
        <ActionForm action={saveSlack} className="grid gap-4 sm:grid-cols-3">
          <Field label="Webhook address" className="sm:col-span-2" hint="Starts with https://hooks.slack.com/. Leave empty to turn Slack off.">
            <input name="slack_webhook_url" type="url" defaultValue={s.slack_webhook_url ?? ""} placeholder="https://hooks.slack.com/services/…" className="input" />
          </Field>
          <Field label="Send (hours before)">
            <input name="slack_lead_hours" type="number" min={1} max={24} defaultValue={s.slack_lead_hours} className="input" />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton className="btn btn-secondary" pendingText="Saving…">
              Save
            </SubmitButton>
          </div>
        </ActionForm>
        {s.slack_webhook_url && (
          <ActionForm action={sendSlackTest} className="mt-3">
            <SubmitButton className="btn btn-secondary btn-sm" pendingText="Sending…">
              Send a test message
            </SubmitButton>
          </ActionForm>
        )}
      </Card>

      <Card title="Seasons" actions={<span className="text-xs text-slate-500">Used for hour totals and attendance</span>}>
        <ul className="mb-5 space-y-3">
          {seasons.map((season) => {
            const current = season.start_date <= t && season.end_date >= t;
            return (
              <li key={season.id} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="font-semibold">{season.name}</span>
                  <Badge tone={season.kind === "in_season" ? "blue" : "gray"}>{season.kind === "in_season" ? "In-season" : "Off-season"}</Badge>
                  {current && <Badge tone="green">Current</Badge>}
                  <span className="ml-auto text-xs text-slate-500">
                    {fmtDate(season.start_date, true)} – {fmtDate(season.end_date, true)}
                  </span>
                </div>
                <ActionForm action={updateSeason.bind(null, season.id)} className="flex flex-wrap items-end gap-2">
                  <input name="name" defaultValue={season.name} required className="input w-40 py-1.5" aria-label="Name" />
                  <select name="kind" defaultValue={season.kind} className="input w-auto py-1.5" aria-label="Kind">
                    <option value="off_season">Off-season</option>
                    <option value="in_season">In-season</option>
                  </select>
                  <input name="start_date" type="date" defaultValue={season.start_date} className="input w-auto py-1.5" aria-label="Start" />
                  <input name="end_date" type="date" defaultValue={season.end_date} className="input w-auto py-1.5" aria-label="End" />
                  <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                </ActionForm>
                <form action={deleteSeason} className="mt-2">
                  <input type="hidden" name="id" value={season.id} />
                  <ConfirmButton message={`Delete ${season.name}? Hours and check-ins are kept.`} className="text-xs text-rose-600 hover:underline">
                    Delete season
                  </ConfirmButton>
                </form>
              </li>
            );
          })}
        </ul>
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Add a season</div>
        <ActionForm action={addSeason} className="flex flex-wrap items-end gap-2">
          <input name="name" placeholder="e.g. 2027 Season" required className="input w-40 py-1.5" aria-label="Name" />
          <select name="kind" className="input w-auto py-1.5" aria-label="Kind" defaultValue="in_season">
            <option value="off_season">Off-season</option>
            <option value="in_season">In-season</option>
          </select>
          <input name="start_date" type="date" required className="input w-auto py-1.5" aria-label="Start" />
          <input name="end_date" type="date" required className="input w-auto py-1.5" aria-label="End" />
          <SubmitButton className="btn btn-primary btn-sm">Add</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="Check-in screen link">
        <p className="text-sm text-slate-600">
          Opens the rotating check-in code without logging in. Use it on a TV in the workshop, or embed it in the meeting slide (for example
          with PowerPoint&apos;s Web Viewer add-in). Anyone with this link can show the code, so share it only with captains.
        </p>
        <CopyField value={displayUrl} />
        <form action={regenerateDisplayKey} className="mt-3">
          <ConfirmButton message="Make a new link? The old link stops working immediately." className="btn btn-secondary btn-sm">
            Make a new link
          </ConfirmButton>
        </form>
      </Card>
    </div>
  );
}
