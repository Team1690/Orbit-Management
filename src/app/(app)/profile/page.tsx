import type { Metadata } from "next";
import { changePassword } from "@/actions/auth";
import { updateMyProfile } from "@/actions/members";
import { ActionForm, SubmitButton } from "@/components/client";
import { Avatar, Badge, Card, Field } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SubjectInputs } from "@/components/member-fields";
import { ROLE_LABEL, SHIRT_SIZES, getMember } from "@/lib/members";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const me = await requireUser();
  const m = (await getMember(me.id))!;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={m.name} size={56} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{m.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5 text-sm text-slate-500">
            {m.role !== "member" && <Badge tone={m.role === "mentor" ? "purple" : "blue"}>{ROLE_LABEL[m.role]}</Badge>}
            {m.subteam && <Badge>{m.subteam}</Badge>}
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
