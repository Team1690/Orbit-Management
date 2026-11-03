import { all, one } from "./db";
import { fmtDate } from "./format";
import { tz } from "./settings";
import { addDays, localParts, zonedToUtc } from "./timeutil";

export type Season = { id: number; name: string; kind: "in_season" | "off_season"; start_date: string; end_date: string };

/** A reporting period: local dates (inclusive) plus the matching UTC instants [from, to). */
export type Period = { label: string; startDate: string; endDate: string; from: Date; to: Date; seasonId?: number };

export function today() {
  return localParts(new Date(), tz()).date;
}

export function periodFromDates(startDate: string, endDate: string, label?: string, seasonId?: number): Period {
  const zone = tz();
  return {
    label: label ?? `${fmtDate(startDate, true)} – ${fmtDate(endDate, true)}`,
    startDate,
    endDate,
    from: zonedToUtc(startDate, "00:00", zone),
    to: zonedToUtc(addDays(endDate, 1), "00:00", zone),
    seasonId,
  };
}

export function listSeasons() {
  return all<Season>("SELECT * FROM seasons ORDER BY start_date DESC");
}

export function seasonPeriod(s: Season) {
  return periodFromDates(s.start_date, s.end_date, s.name, s.id);
}

/** The season containing today, or the last 90 days when no season covers today. */
export function currentPeriod(): Period {
  const t = today();
  const season = one<Season>("SELECT * FROM seasons WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1", t, t);
  if (season) return seasonPeriod(season);
  return periodFromDates(addDays(t, -89), t, "Last 90 days");
}

export function currentSeason() {
  const t = today();
  return one<Season>("SELECT * FROM seasons WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1", t, t);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads ?season=ID or ?from=YYYY-MM-DD&to=YYYY-MM-DD, falling back to the current period. */
export function periodFromSearch(sp: { season?: string; from?: string; to?: string }): Period {
  if (sp.from && sp.to && DATE_RE.test(sp.from) && DATE_RE.test(sp.to) && sp.from <= sp.to) {
    return periodFromDates(sp.from, sp.to);
  }
  if (sp.season) {
    const s = one<Season>("SELECT * FROM seasons WHERE id = ?", Number(sp.season));
    if (s) return seasonPeriod(s);
  }
  return currentPeriod();
}

export function thisWeek(): Period {
  const zone = tz();
  const now = localParts(new Date(), zone);
  const start = addDays(now.date, -now.weekday); // weeks start on Sunday
  return periodFromDates(start, addDays(start, 6), "This week");
}
