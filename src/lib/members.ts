import { all, one, run } from "./db";
import { randomToken, sha256 } from "./password";
import type { Role } from "./auth";

export type Member = {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: number;
  /** For mentors: a lead mentor sees every upcoming meeting, like a captain. */
  lead_mentor: number;
  /** For members: a subteam lead can view their own subteam's attendance (read-only). */
  subteam_lead: number;
  phone: string | null;
  grade: string | null;
  subteam: string | null;
  birthday: string | null;
  joined_year: number | null;
  shirt_size: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  medical_notes: string | null;
  /** The two subjects (majors) the student chose at school. */
  subject_1: string | null;
  subject_2: string | null;
  /** Teams on top of the main subteam, e.g. ["Strategy", "Drive team"]. */
  teams: string[];
  has_password: number;
  invite_expires_at: string | null;
  created_at: string;
};

const MEMBER_COLUMNS = `id, name, email, role, active, lead_mentor, subteam_lead, phone, grade, subteam, subject_1, subject_2, birthday, joined_year,
  shirt_size, parent_name, parent_phone, medical_notes, (password_hash IS NOT NULL)::int AS has_password, invite_expires_at, created_at,
  (SELECT string_agg(team, '|') FROM member_teams t WHERE t.user_id = users.id) AS teams`;

/** Every member belongs to one main subteam… */
export const SUBTEAMS = ["CAD", "Mechanical", "Robot software", "Applications"];
/** …and can also join any of these. */
export const EXTRA_TEAMS = ["Strategy", "Electronics", "Drive team", "Media", "Community outreach"];
export const GRADES = ["9", "10", "11", "12", "Alumni"];
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
/** A filter choice for members who left a field empty (no grade, subteam or shirt size). */
export const NOT_SET = "none";
/** Suggestions for the school-subject fields; any other text is allowed too. */
export const SCHOOL_SUBJECTS = [
  "Physics",
  "Computer Science",
  "Chemistry",
  "Biology",
  "Electronics",
  "Biotechnology",
  "Mechanical Engineering",
  "Economics",
  "Literature",
  "History",
  "Geography",
  "Social Sciences",
  "Psychology",
  "Communication",
  "Arts",
  "Music",
  "Theater",
  "Film",
  "Arabic",
  "French",
];

export const ROLE_LABEL: Record<Role, string> = { member: "Member", captain: "Captain", mentor: "Mentor" };

type RoleFlags = Pick<Member, "role" | "lead_mentor" | "subteam_lead">;

/** "Lead mentor" and "Subteam lead" for those flags, otherwise the role's label. */
export function roleLabel(m: RoleFlags) {
  if (m.role === "mentor" && m.lead_mentor) return "Lead mentor";
  if (m.role === "member" && m.subteam_lead) return "Subteam lead";
  return ROLE_LABEL[m.role];
}

/** The value of a member's Role dropdown: lead mentors are mentors with the flag set, subteam leads members with theirs. */
export function roleChoice(m: RoleFlags) {
  if (m.role === "mentor" && m.lead_mentor) return "lead_mentor";
  if (m.role === "member" && m.subteam_lead) return "subteam_lead";
  return m.role;
}

/** Whether to show a role badge: everyone but plain members. */
export function hasRoleBadge(m: RoleFlags) {
  return m.role !== "member" || !!m.subteam_lead;
}

type MemberRow = Omit<Member, "teams"> & { teams: string | null };

function withTeams(row: MemberRow): Member {
  return { ...row, teams: row.teams ? row.teams.split("|").sort((a, b) => EXTRA_TEAMS.indexOf(a) - EXTRA_TEAMS.indexOf(b)) : [] };
}

export async function listMembers(opts: { includeInactive?: boolean } = {}) {
  return (await all<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM users WHERE (? = 1 OR active = 1) ORDER BY lower(name)`, !!opts.includeInactive)).map(
    withTeams,
  );
}

/** Active members who are students (captains and members, not mentors). */
export async function listStudents() {
  return (await listMembers()).filter((m) => m.role !== "mentor");
}

export async function getMember(id: number) {
  if (!Number.isSafeInteger(id)) return undefined; // e.g. /members/abc
  const row = await one<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM users WHERE id = ?`, id);
  return row ? withTeams(row) : undefined;
}

export async function setTeams(userId: number, teams: string[]) {
  await run("DELETE FROM member_teams WHERE user_id = ?", userId);
  for (const team of teams.filter((t) => EXTRA_TEAMS.includes(t))) {
    await run("INSERT INTO member_teams (user_id, team) VALUES (?, ?)", userId, team);
  }
}

/** Matches typed or imported text to a subteam name ("robot software" → "Robot software"). */
export function normalizeSubteam(value: string | null | undefined) {
  if (!value) return null;
  return SUBTEAMS.find((s) => s.toLowerCase() === value.trim().toLowerCase()) ?? undefined;
}

const INVITE_DAYS = 14;

/** Creates a fresh invite link token for a member (also used to reset a forgotten password). */
export async function createInvite(userId: number) {
  const token = randomToken(24);
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  await run("UPDATE users SET invite_hash = ?, invite_expires_at = ? WHERE id = ?", sha256(token), expires, userId);
  return token;
}

export function findByInvite(token: string) {
  return one<{ id: number; name: string; email: string; role: Role }>(
    "SELECT id, name, email, role FROM users WHERE invite_hash = ? AND invite_expires_at > ? AND active = 1",
    sha256(token),
    new Date().toISOString(),
  );
}

export type CaptainNote = { id: number; body: string; created_at: string; author_name: string | null };

export function notesFor(memberId: number) {
  return all<CaptainNote>(
    `SELECT n.id, n.body, n.created_at, a.name AS author_name
       FROM captain_notes n LEFT JOIN users a ON a.id = n.author_id
      WHERE n.member_id = ? ORDER BY n.created_at DESC`,
    memberId,
  );
}
