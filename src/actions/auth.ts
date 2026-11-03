"use server";

import { redirect } from "next/navigation";
import { endSession, hasAnyUsers, homeFor, requireUser, startSession, type Role } from "@/lib/auth";
import { completePendingCheckin } from "@/lib/checkin";
import { one, run, tx } from "@/lib/db";
import { EMAIL_RE, str, type FormState } from "@/lib/forms";
import { findByInvite } from "@/lib/members";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setSetting, tz } from "@/lib/settings";
import { localParts } from "@/lib/timeutil";

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const user = await one<{ id: number; role: Role; password_hash: string | null; active: number }>(
    "SELECT id, role, password_hash, active FROM users WHERE lower(email) = ?",
    email,
  );
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return { error: "Wrong email or password." };
  }
  await startSession(user.id);
  redirect((await completePendingCheckin(user.id)) ?? homeFor(user));
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** First run: creates the first captain account. */
export async function setupTeam(_: FormState, fd: FormData): Promise<FormState> {
  if (await hasAnyUsers()) return { error: "This app is already set up. Log in instead." };
  const teamName = str(fd, "team_name") || "Orbit 1690";
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!name) return { error: "Enter your name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };

  const userId = await tx(async () => {
    // Checked again inside the transaction, in case two people submit the setup form at once.
    if (await hasAnyUsers()) return null;
    await setSetting("team_name", teamName);
    await seedSeasons();
    return (await run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'captain') RETURNING id", name, email, hashPassword(password))).id;
  });
  if (!userId) return { error: "This app is already set up. Log in instead." };
  await startSession(userId);
  redirect("/dashboard?welcome=1");
}

/** Starter seasons (FRC build season starts with kickoff in early January). Editable in Settings. */
async function seedSeasons() {
  const { year, month } = localParts(new Date(), tz());
  const seasonYear = month >= 5 ? year + 1 : year;
  await run(
    "INSERT INTO seasons (name, kind, start_date, end_date) VALUES (?, 'off_season', ?, ?), (?, 'in_season', ?, ?)",
    `Off-season ${seasonYear - 1}`,
    `${seasonYear - 1}-05-01`,
    `${seasonYear - 1}-12-31`,
    `${seasonYear} Season`,
    `${seasonYear}-01-01`,
    `${seasonYear}-04-30`,
  );
}

export async function acceptInvite(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await findByInvite(token);
  if (!user) return { error: "This link has expired or was already used. Ask a captain for a new one." };
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The passwords don't match." };
  await run("UPDATE users SET password_hash = ?, invite_hash = NULL, invite_expires_at = NULL WHERE id = ?", hashPassword(password), user.id);
  await run("DELETE FROM sessions WHERE user_id = ?", user.id);
  await startSession(user.id);
  redirect((await completePendingCheckin(user.id)) ?? homeFor(user));
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const row = await one<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", me.id);
  if (!verifyPassword(current, row?.password_hash)) return { error: "Your current password is wrong." };
  if (next.length < 8) return { error: "Use a password of at least 8 characters." };
  await run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), me.id);
  return { message: "Password changed." };
}
