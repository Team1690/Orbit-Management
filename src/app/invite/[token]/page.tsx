import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvite } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";
import { firstName } from "@/lib/format";
import { findByInvite } from "@/lib/members";

export const metadata: Metadata = { title: "Set your password" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = findByInvite(token);
  if (!user) {
    return (
      <AuthShell title="Link expired" subtitle="This link has expired or was already used. Ask a captain to send you a new one.">
        <Link href="/login" className="btn btn-secondary w-full">
          Go to log in
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Welcome, ${firstName(user.name)}!`} subtitle={`Choose a password for ${user.email}.`}>
      <ActionForm action={acceptInvite.bind(null, token)} className="space-y-4">
        <Field label="New password" hint="At least 8 characters.">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <Field label="Repeat password">
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Saving…">
          Set password and log in
        </SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
