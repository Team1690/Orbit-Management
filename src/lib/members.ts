import { all, one, run } from "./db";
import { randomToken, sha256 } from "./password";
import type { Role } from "./auth";

export type Member = {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: number;
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

const MEMBER_COLUMNS = `id, name, email, role, active, phone, grade, subteam, subject_1, subject_2, birthday, joined_year,
  shirt_size, parent_name, parent_phone, medical_notes, password_hash IS NOT NULL AS has_password, invite_expires_at, created_at,
  (SELECT group_concat(team, '|') FROM member_teams t WHERE t.user_id = users.id) AS teams`;

/** Every member belongs to one main subteam… */
export const SUBTEAMS = ["CAD", "Mechanical", "Robot software", "Applications"];
/** …and can also join any of these. */
export const EXTRA_TEAMS = ["Strategy", "Electronics", "Drive team", "Media", "Community outreach"];
export const GRADES = ["9", "10", "11", "12", "Alumni"];
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
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

type MemberRow = Omit<Member, "teams"> & { teams: string | null };

function withTeams(row: MemberRow): Member {
  return { ...row, teams: row.teams ? row.teams.split("|").sort((a, b) => EXTRA_TEAMS.indexOf(a) - EXTRA_TEAMS.indexOf(b)) : [] };
}

export function listMembers(opts: { includeInactive?: boolean } = {}) {
  return all<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM users WHERE (? OR active = 1) ORDER BY name COLLATE NOCASE`, !!opts.includeInactive).map(
    withTeams,
  );
}

/** Active members who are students (captains and members, not mentors). */
export function listStudents() {
  return listMembers().filter((m) => m.role !== "mentor");
}

export function getMember(id: number) {
  const row = one<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM users WHERE id = ?`, id);
  return row ? withTeams(row) : undefined;
}

export function setTeams(userId: number, teams: string[]) {
  run("DELETE FROM member_teams WHERE user_id = ?", userId);
  for (const team of teams.filter((t) => EXTRA_TEAMS.includes(t))) {
    run("INSERT INTO member_teams (user_id, team) VALUES (?, ?)", userId, team);
  }
}

/** Matches typed or imported text to a subteam name ("robot software" → "Robot software"). */
export function normalizeSubteam(value: string | null | undefined) {
  if (!value) return null;
  return SUBTEAMS.find((s) => s.toLowerCase() === value.trim().toLowerCase()) ?? undefined;
}

const INVITE_DAYS = 14;

/** Creates a fresh invite link token for a member (also used to reset a forgotten password). */
export function createInvite(userId: number) {
  const token = randomToken(24);
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  run("UPDATE users SET invite_hash = ?, invite_expires_at = ? WHERE id = ?", sha256(token), expires, userId);
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
