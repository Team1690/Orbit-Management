import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { setupTeam } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";
import { hasAnyUsers } from "@/lib/auth";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  await connection(); // depends on the database, so never prerender at build time
  if (await hasAnyUsers()) redirect("/login");
  return (
    <AuthShell title="Set up your team" subtitle="Create the first captain account. You can add everyone else afterwards.">
      <ActionForm action={setupTeam} className="space-y-4">
        <Field label="Team name">
          <input name="team_name" defaultValue="Orbit 1690" required className="input" />
        </Field>
        <Field label="Your name">
          <input name="name" autoComplete="name" required className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Creating…">
          Create captain account
        </SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
