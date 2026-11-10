import type { Metadata } from "next";
import { changePassword } from "@/actions/auth";
import { updateMyProfile } from "@/actions/members";
import { setStaffAlerts } from "@/actions/push";
import { addAbsence, deleteAbsence } from "@/actions/absences";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/client";
import { Avatar, Badge, Card, Field } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SubjectInputs } from "@/components/member-fields";
import { PushToggle } from "@/components/push-toggle";
import { SHIRT_SIZES, getMember, hasRoleBadge, roleLabel } from "@/lib/members";
import { vapidPublicKey } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { upcomingAbsences } from "@/lib/absences";
import { fmtDate } from "@/lib/format";
import { today } from "@/lib/periods";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const me = await requireUser();
  const m = (await getMember(me.id))!;
  const { missing_alert_min } = await getSettings();
  const t = today();
  const absences = m.role === "mentor" ? [] : await upcomingAbsences(me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={m.name} size={56} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-slate-500">
            {hasRoleBadge(m) && <Badge tone={m.role === "mentor" ? "purple" : "blue"}>{roleLabel(m)}</Badge>}
            {m.subteams.map((st) => (
              <Badge key={st}>{st}</Badge>
            ))}
            {m.teams.map((t) => (
              <Badge key={t} tone="gray">
                {t}
              </Badge>
            ))}
            {m.grade && <Badge>Grade {m.grade}</Badge>}
          </div>
        </div>
      </div>

      <Card title="My details">
        <p className="mb-4 text-sm text-slate-500">
          {m.email}. To change your name, email, subteam, teams or grade, ask a captain.
        </p>
        <ActionForm action={updateMyProfile} className="grid gap-4 sm:grid-cols-2">
          {m.role !== "mentor" && <SubjectInputs subject1={m.subject_1} subject2={m.subject_2} className="sm:col-span-2" />}
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={m.phone ?? ""} className="input" />
          </Field>
          <Field label="Birthday">
            <input name="birthday" type="date" defaultValue={m.birthday ?? ""} className="input" />
          </Field>
          <Field label="Shirt size">
            <select name="shirt_size" defaultValue={m.shirt_size ?? ""} className="input">
              <option value="">—</option>
              {SHIRT_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Parent / guardian name">
            <input name="parent_name" defaultValue={m.parent_name ?? ""} className="input" />
          </Field>
          <Field label="Parent / guardian phone">
            <input name="parent_phone" type="tel" defaultValue={m.parent_phone ?? ""} className="input" />
          </Field>
          <Field label="Allergies / medical notes" className="sm:col-span-2" hint="Only captains can see this.">
            <textarea name="medical_notes" rows={2} defaultValue={m.medical_notes ?? ""} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Saving…">Save</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {m.role !== "mentor" && (
        <Card title="Notifications">
          <p className="mb-3 text-sm text-slate-600">
            RSVP reminders and meeting reminders on this device{m.role === "captain" ? ", plus captain alerts" : ""}.
          </p>
          <PushToggle publicKey={await vapidPublicKey()} what="reminders" />
        </Card>
      )}

      {m.role === "mentor" && !!m.lead_mentor && (
        <Card title="Notifications">
          <p className="mb-3 text-sm text-slate-600">Meeting reminders on this device, plus captain alerts if you keep them on below.</p>
          <PushToggle publicKey={await vapidPublicKey()} what="alerts" />
          <form action={setStaffAlerts} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="on" value={m.staff_alerts ? "0" : "1"} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium text-slate-900">Captain alerts: {m.staff_alerts ? "on" : "off"}</div>
              <div className="text-slate-500">
                Who hasn&apos;t checked in {missing_alert_min} minutes after a meeting starts, and who didn&apos;t answer when RSVPs close. Meeting
                reminders keep coming either way.
              </div>
            </div>
            <SubmitButton className={`btn btn-sm ${m.staff_alerts ? "btn-secondary" : "btn-primary"}`} pendingText="…">
              {m.staff_alerts ? "Turn off" : "Turn on"}
            </SubmitButton>
          </form>
        </Card>
      )}

      {m.role !== "mentor" && (
        <div id="absences" className="scroll-mt-20">
          <Card title="Planned absences">
            <p className="mb-3 text-sm text-slate-600">
              Away for a few days? Add the dates and a short reason. Every meeting in between is answered &ldquo;Can&apos;t come&rdquo; for
              you with that reason, including meetings added later. You can still change a single answer yourself.
            </p>
            {absences.length > 0 && (
              <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {absences.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {a.start_date === a.end_date ? fmtDate(a.start_date) : `${fmtDate(a.start_date)} – ${fmtDate(a.end_date)}`}
                      </span>
                      <span className="block truncate text-slate-500">{a.reason}</span>
                    </span>
                    <form action={deleteAbsence}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton
                        message="Remove this absence? Meetings it answered for you go back to no answer."
                        className="btn btn-ghost btn-sm text-rose-600"
                      >
                        Remove
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addAbsence} className="grid grid-cols-2 gap-3">
              <Field label="First day">
                <input name="start_date" type="date" min={t} defaultValue={t} required className="input" />
              </Field>
              <Field label="Last day">
                <input name="end_date" type="date" min={t} defaultValue={t} required className="input" />
              </Field>
              <Field label="Reason" className="col-span-2">
                <input name="reason" maxLength={200} required placeholder="e.g. Class trip to the north" className="input" />
              </Field>
              <div className="col-span-2">
                <SubmitButton pendingText="Saving…">Add absence</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      )}

      <Card title="Change password">
        <ActionForm action={changePassword} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password">
            <input name="current" type="password" autoComplete="current-password" required className="input" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton className="btn btn-secondary" pendingText="Saving…">
              Change password
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
