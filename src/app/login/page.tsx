import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { login } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, SubmitButton } from "@/components/client";
import { Banner, Field } from "@/components/ui";
import { getUser, hasAnyUsers, homeFor } from "@/lib/auth";
import { PENDING_COOKIE } from "@/lib/qr";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  await connection(); // depends on the database, so never prerender at build time
  if (!(await hasAnyUsers())) redirect("/setup");
  const user = await getUser();
  if (user) redirect(homeFor(user));
  const pendingCheckin = (await cookies()).has(PENDING_COOKIE);

  return (
    <AuthShell title="Log in" subtitle="Use the email your captains registered for you.">
      {pendingCheckin && <Banner tone="blue">Log in to finish checking in.</Banner>}
      <ActionForm action={login} className="space-y-4">
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Logging in…">
          Log in
        </SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-xs text-slate-500">Forgot your password? Ask a captain for a reset link.</p>
    </AuthShell>
  );
}
