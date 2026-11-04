// Who a meeting is for: the whole team, or some teams (main subteams and extra teams like
// Strategy) and/or individual students. Only they get the RSVP, the reminders and an attendance
// entry; everyone else is left out of the lists, so they're never "absent".
// Stored as JSON text in meetings.audience and schedule.audience; NULL means the whole team.
// No local imports, so client components can use it too.

export type Audience = { teams: string[]; members: number[] };

export function parseAudience(json: string | null | undefined): Audience | null {
  if (!json) return null;
  try {
    const a = JSON.parse(json) as Partial<Audience>;
    const teams = Array.isArray(a.teams) ? a.teams.filter((t) => typeof t === "string") : [];
    const members = Array.isArray(a.members) ? a.members.filter((m) => Number.isSafeInteger(m)) : [];
    return teams.length || members.length ? { teams, members } : null;
  } catch {
    return null;
  }
}

/** Reads the picker's checkboxes (aud_team, aud_member); null when nothing is ticked (the whole team). */
export function readAudience(fd: FormData, validTeams: string[]): string | null {
  const teams = [...new Set(fd.getAll("aud_team").map(String))].filter((t) => validTeams.includes(t));
  const members = [...new Set(fd.getAll("aud_member").map(Number))].filter((id) => Number.isSafeInteger(id));
  return teams.length || members.length ? JSON.stringify({ teams, members }) : null;
}

/** Whether a student is expected: the whole team, one of their teams, or picked by name. */
export function inAudience(audience: Audience | null, member: { id: number; subteam: string | null; teams: string[] }) {
  if (!audience) return true;
  if (audience.members.includes(member.id)) return true;
  if (member.subteam && audience.teams.includes(member.subteam)) return true;
  return member.teams.some((t) => audience.teams.includes(t));
}

/** "CAD, Strategy + 2 people", or null for the whole team. */
export function audienceLabel(audience: Audience | null) {
  if (!audience) return null;
  const people = audience.members.length ? `${audience.members.length} ${audience.members.length === 1 ? "person" : "people"}` : "";
  return [audience.teams.join(", "), people].filter(Boolean).join(" + ");
}
