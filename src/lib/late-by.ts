// How late a member expects to be, picked from a list when they answer "Late" to an RSVP.
// Stored as the upper end of the range in minutes (rsvps.late_by_min); 90 means "more than an hour".
// Leaf module (no imports) so client components and scripts/ can use it too.

export const LATE_BY_OPTIONS = [10, 20, 30, 40, 50, 60, 90];

/** "Up to 10 min", "10–20 min", … "More than an hour". */
export function lateByLabel(min: number) {
  if (min <= 10) return "Up to 10 min";
  if (min <= 60) return `${min - 10}–${min} min`;
  return "More than an hour";
}

/** What a member added to a "late" or "can't come" answer: how late, then their note. */
export function rsvpDetail(r: { late_by_min: number | null; note: string | null }) {
  return [r.late_by_min ? lateByLabel(r.late_by_min) : null, r.note].filter(Boolean).join(" · ") || null;
}
