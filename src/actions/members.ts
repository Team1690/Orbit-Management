"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCaptain, requireUser, type Role } from "@/lib/auth";
import { one, run, tx } from "@/lib/db";
import { DATE_RE, EMAIL_RE, TIME_RE, int, optStr, str, type FormState } from "@/lib/forms";
import { SUBTEAMS, createInvite, normalizeSubteam, setTeams } from "@/lib/members";
import { appOrigin } from "@/lib/qr";
import { tz } from "@/lib/settings";
import { addDays, zonedToUtc } from "@/lib/timeutil";

async function inviteUrl(token: string) {
  return `${appOrigin(await headers())}/invite/${token}`;
}

async function emailTaken(email: string, exceptId?: number) {
  return !!(await one("SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?", email, exceptId ?? 0));
}

function readRole(fd: FormData): Role {
  const role = str(fd, "role");
  return role === "captain" || role === "mentor" ? role : "member";
}

export async function createMember(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  if (!name) return { error: "Enter a name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email." };
  if (await emailTaken(email)) return { error: "Someone with that email already exists." };
  const subteam = normalizeSubteam(optStr(fd, "subteam"));
  if (subteam === undefined) return { error: "Pick a subteam from the list." };
  const role = readRole(fd);
  const id = await tx(async () => {
    const { id } = await run(
      "INSERT INTO users (name, email, role, subteam, grade, phone, joined_year) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      name,
      email,
      role,
      subteam,
      role === "mentor" ? null : optStr(fd, "grade"),
      optStr(fd, "phone"),
      new Date().getFullYear(),
    );
    await setTeams(id, fd.getAll("teams").map(String));
    return id;
  });
  const link = await inviteUrl(await createInvite(id));
  revalidatePath("/", "layout");
  return { message: `${name} was added. Send them this link to set their password (valid for 14 days):`, link };
}

/** Adds many members at once from pasted lines of "Name, email, subteam, grade". */
export async function importMembers(_: FormState, fd: FormData): Promise<FormState> {
  await requireCaptain();
  const lines = str(fd, "rows")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { error: "Paste at least one line." };

  const errors: string[] = [];
  const parsed: { name: string; email: string; subteam: string | null; grade: string | null }[] = [];
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    const [name = "", email = "", subteamText = "", grade = ""] = line.split(/[,\t]/).map((c) => c.trim());
    const e = email.toLowerCase();
    const subteam = normalizeSubteam(subteamText);
    if (!name || !EMAIL_RE.test(e)) errors.push(`Line ${i + 1}: needs a name and a valid email.`);
    else if (seen.has(e) || (await emailTaken(e))) errors.push(`Line ${i + 1}: ${e} already exists.`);
    else if (subteam === undefined) errors.push(`Line ${i + 1}: subteam must be one of ${SUBTEAMS.join(", ")}.`);
    else {
      seen.add(e);
      parsed.push({ name, email: e, subteam, grade: grade || null });
    }
  }
  if (errors.length) return { error: `Nothing was added. ${errors.slice(0, 5).join(" ")}` };

  const origin = appOrigin(await headers());
  const links = await tx(async () => {
    const out: { label: string; value: string }[] = [];
    for (const p of parsed) {
      const { id } = await run(
        "INSERT INTO users (name, email, subteam, grade, joined_year) VALUES (?, ?, ?, ?, ?) RETURNING id",
        p.name,
        p.email,
        p.subteam,
        p.grade,
        new Date().getFullYear(),
      );
      out.push({ label: `${p.name} (${p.email})`, value: `${origin}/invite/${await createInvite(id)}` });
    }
    return out;
  });
  revalidatePath("/", "layout");
  return { message: `Added ${links.length} members. Send each one their link:`, links };
}

export async function updateMember(id: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireCaptain();
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  if (!name) return { error: "Enter a name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email." };
  if (await emailTaken(email, id)) return { error: "Someone else already uses that email." };
  const role = readRole(fd);
  const active = str(fd, "active") !== "0";
  if (id === me.id && (role !== "captain" || !active)) return { error: "You can't remove your own captain access." };
  const birthday = optStr(fd, "birthday");
  if (birthday && !DATE_RE.test(birthday)) return { error: "Birthday must be a date." };
  const subteam = normalizeSubteam(optStr(fd, "subteam"));
  if (subteam === undefined) return { error: "Pick a subteam from the list." };

  await tx(async () => {
    await run(
      `UPDATE users SET name = ?, email = ?, role = ?, active = ?, phone = ?, grade = ?, subteam = ?, subject_1 = ?, subject_2 = ?,
         birthday = ?, joined_year = ?, shirt_size = ?, parent_name = ?, parent_phone = ?, medical_notes = ?
       WHERE id = ?`,
      name,
      email,
      role,
      active,
      optStr(fd, "phone"),
      optStr(fd, "grade"),
      subteam,
      optStr(fd, "subject_1"),
      optStr(fd, "subject_2"),
      birthday,
      int(fd, "joined_year"),
      optStr(fd, "shirt_size"),
      optStr(fd, "parent_name"),
      optStr(fd, "parent_phone"),
      optStr(fd, "medical_notes"),
      id,
    );
    await setTeams(id, fd.getAll("teams").map(String));
  });
  if (!active) await run("DELETE FROM sessions WHERE user_id = ?", id);
  revalidatePath("/", "layout");
  redirect(`/members/${id}`);
}

/** Members can edit their own contact details; the rest is managed by captains. */
export async function updateMyProfile(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const birthday = optStr(fd, "birthday");
  if (birthday && !DATE_RE.test(birthday)) return { error: "Birthday must be a date." };
  await run(
    `UPDATE users SET phone = ?, birthday = ?, shirt_size = ?, parent_name = ?, parent_phone = ?, medical_notes = ? WHERE id = ?`,
    optStr(fd, "phone"),
    birthday,
    optStr(fd, "shirt_size"),
    optStr(fd, "parent_name"),
    optStr(fd, "parent_phone"),
    optStr(fd, "medical_notes"),
    me.id,
  );
  if (me.role !== "mentor") {
    await run("UPDATE users SET subject_1 = ?, subject_2 = ? WHERE id = ?", optStr(fd, "subject_1"), optStr(fd, "subject_2"), me.id);
  }
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function makeInviteLink(memberId: number, _: FormState): Promise<FormState> {
  await requireCaptain();
  const member = await one<{ name: string; has_password: number }>(
    "SELECT name, (password_hash IS NOT NULL)::int AS has_password FROM users WHERE id = ?",
    memberId,
  );
  if (!member) return { error: "Member not found." };
  const link = await inviteUrl(await createInvite(memberId));
  revalidatePath(`/members/${memberId}`);
  return {
    message: member.has_password
      ? `Password reset link for ${member.name} (valid 14 days). Their current password keeps working until they use it:`
      : `Invite link for ${member.name} (valid 14 days):`,
    link,
  };
}

export async function addNote(memberId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireCaptain();
  const body = str(fd, "body");
  if (!body) return { error: "Write something first." };
  await run("INSERT INTO captain_notes (member_id, author_id, body) VALUES (?, ?, ?)", memberId, me.id, body.slice(0, 4000));
  revalidatePath(`/members/${memberId}`);
  return undefined;
}

export async function deleteNote(fd: FormData) {
  await requireCaptain();
  await run("DELETE FROM captain_notes WHERE id = ?", Number(fd.get("id")));
  revalidatePath("/", "layout");
}

/** Reads date + times from a visit form into UTC instants. An end time earlier than the start means the next day. */
function readVisitTimes(fd: FormData) {
  const date = str(fd, "date");
  const inTime = str(fd, "in");
  const outTime = str(fd, "out");
  if (!DATE_RE.test(date) || !TIME_RE.test(inTime)) return { error: "Enter a date and check-in time." } as const;
  if (outTime && !TIME_RE.test(outTime)) return { error: "Check-out time is invalid." } as const;
  const zone = tz();
  const checkIn = zonedToUtc(date, inTime, zone);
  let checkOut = outTime ? zonedToUtc(date, outTime, zone) : null;
  if (checkOut && checkOut <= checkIn) checkOut = zonedToUtc(addDays(date, 1), outTime, zone);
  if (checkIn.getTime() > Date.now() + 60_000) return { error: "Check-in can't be in the future." } as const;
  return { checkIn: checkIn.toISOString(), checkOut: checkOut?.toISOString() ?? null };
}

export async function addVisit(memberId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireCaptain();
  const t = readVisitTimes(fd);
  if ("error" in t) return { error: t.error };
  if (!t.checkOut && (await one("SELECT 1 FROM visits WHERE user_id = ? AND check_out IS NULL", memberId))) {
    return { error: "They're already checked in. Add a check-out time." };
  }
  await run(
    "INSERT INTO visits (user_id, check_in, check_out, in_method, out_method, edited_by) VALUES (?, ?, ?, 'manual', ?, ?)",
    memberId,
    t.checkIn,
    t.checkOut,
    t.checkOut ? "manual" : null,
    me.id,
  );
  revalidatePath("/", "layout");
  return { message: "Visit added." };
}

export async function updateVisit(visitId: number, _: FormState, fd: FormData): Promise<FormState> {
  const me = await requireCaptain();
  const t = readVisitTimes(fd);
  if ("error" in t) return { error: t.error };
  const current = await one<{ check_out: string | null; out_method: string | null }>("SELECT check_out, out_method FROM visits WHERE id = ?", visitId);
  if (!current) return { error: "Visit not found." };
  const outMethod = t.checkOut ? (t.checkOut === current.check_out ? current.out_method : "manual") : null;
  try {
    await run("UPDATE visits SET check_in = ?, check_out = ?, out_method = ?, edited_by = ? WHERE id = ?", t.checkIn, t.checkOut, outMethod, me.id, visitId);
  } catch {
    return { error: "They already have another open visit. Add a check-out time." };
  }
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function deleteVisit(visitId: number) {
  await requireCaptain();
  await run("DELETE FROM visits WHERE id = ?", visitId);
  revalidatePath("/", "layout");
}
