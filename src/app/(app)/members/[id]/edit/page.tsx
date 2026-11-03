import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateMember } from "@/actions/members";
import { ActionForm, SubmitButton } from "@/components/client";
import { Card, Field, PageHeader } from "@/components/ui";
import { requireCaptain } from "@/lib/auth";
import { SubjectInputs, SubteamSelect, TeamCheckboxes } from "@/components/member-fields";
import { GRADES, SHIRT_SIZES, getMember } from "@/lib/members";

export const metadata: Metadata = { title: "Edit member" };

export default async function EditMemberPage({ params }: PageProps<"/members/[id]/edit">) {
  await requireCaptain();
  const id = Number((await params).id);
  const m = getMember(id);
  if (!m) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${m.name}`}
        actions={
          <Link href={`/members/${id}`} className="btn btn-secondary">
            Cancel
          </Link>
        }
      />
      <Card>
        <ActionForm action={updateMember.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input name="name" defaultValue={m.name} required className="input" />
          </Field>
          <Field label="Email" hint="Used to log in.">
            <input name="email" type="email" defaultValue={m.email} required className="input" />
          </Field>
          <SubteamSelect defaultValue={m.subteam} />
          <Field label="Grade">
            <select name="grade" defaultValue={m.grade ?? ""} className="input">
              <option value="">—</option>
              {GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select name="role" defaultValue={m.role} className="input">
              <option value="member">Member</option>
              <option value="captain">Captain</option>
              <option value="mentor">Mentor</option>
            </select>
          </Field>
          <Field label="Status" hint="Inactive members can't log in and aren't counted in attendance.">
            <select name="active" defaultValue={m.active ? "1" : "0"} className="input">
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
          <TeamCheckboxes selected={m.teams} className="sm:col-span-2" />
          <SubjectInputs subject1={m.subject_1} subject2={m.subject_2} className="sm:col-span-2" />
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={m.phone ?? ""} className="input" />
          </Field>
          <Field label="Birthday">
            <input name="birthday" type="date" defaultValue={m.birthday ?? ""} className="input" />
          </Field>
          <Field label="Joined (year)">
            <input name="joined_year" type="number" min={2000} max={2100} defaultValue={m.joined_year ?? ""} className="input" />
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
          <Field label="Allergies / medical notes" className="sm:col-span-2">
            <textarea name="medical_notes" rows={2} defaultValue={m.medical_notes ?? ""} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
