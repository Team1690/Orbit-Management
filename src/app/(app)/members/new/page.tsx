import type { Metadata } from "next";
import Link from "next/link";
import { createMember, importMembers } from "@/actions/members";
import { ActionForm, SubmitButton } from "@/components/client";
import { Card, Field, PageHeader } from "@/components/ui";
import { requireCaptain } from "@/lib/auth";
import { SubteamSelect, TeamCheckboxes } from "@/components/member-fields";
import { GRADES, SUBTEAMS } from "@/lib/members";

export const metadata: Metadata = { title: "Add members" };

export default async function NewMemberPage() {
  await requireCaptain();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add members"
        subtitle="Each new member gets a link to set their own password."
        actions={
          <Link href="/members" className="btn btn-secondary">
            Back to members
          </Link>
        }
      />
      <div className="space-y-5">
        <Card title="One member">
          <ActionForm action={createMember} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input name="name" required className="input" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required className="input" />
            </Field>
            <SubteamSelect />
            <Field label="Grade">
              <select name="grade" className="input" defaultValue="">
                <option value="">—</option>
                {GRADES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" className="input" />
            </Field>
            <Field label="Role">
              <select name="role" className="input" defaultValue="member">
                <option value="member">Member</option>
                <option value="captain">Captain</option>
                <option value="mentor">Mentor</option>
                <option value="lead_mentor">Lead mentor (sees every upcoming meeting)</option>
              </select>
            </Field>
            <TeamCheckboxes className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Adding…">Add member</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card title="Many at once">
          <ActionForm action={importMembers} className="space-y-3">
            <Field
              label="One member per line: name, email, subteam, grade"
              hint={`Subteam (${SUBTEAMS.join(", ")}) and grade are optional. You can paste straight from a spreadsheet. Set extra teams and mentors one by one.`}
            >
              <textarea
                name="rows"
                rows={8}
                className="input font-mono text-sm"
                placeholder={"Noa Levi, noa@example.com, Mechanical, 10\nAmit Cohen, amit@example.com, Robot software, 11"}
              />
            </Field>
            <SubmitButton pendingText="Adding…">Add all</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
