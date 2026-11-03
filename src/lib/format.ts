import { tz } from "./settings";
import { localParts } from "./timeutil";

// Server-side display formatting in the team's time zone. Pass the resulting strings
// to client components rather than formatting there, so server and client agree.

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions) {
  const zone = tz();
  const key = zone + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...options });
    cache.set(key, f);
  }
  return f;
}

export function fmtTime(iso: string | Date) {
  return fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function fmtDateTime(iso: string | Date) {
  return fmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

/** The local day of an instant, e.g. "Tue 4 Nov". */
export function fmtDay(iso: string | Date) {
  return fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

/** Formats a local YYYY-MM-DD date, e.g. "Tue 4 Nov". */
export function fmtDate(date: string, withYear = false) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function relativeDay(date: string) {
  const today = localParts(new Date(), tz()).date;
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtDate(date);
}

/** "3h 25m", "45m" */
export function fmtDuration(ms: number) {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Ronit" from "Dr. Ronit Avidan": the first word that isn't a title like "Dr." */
export function firstName(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return words.find((w) => !w.endsWith(".")) ?? words[0] ?? name;
}

/** Whole minutes between the start and a later check-in (at least 1). */
export function minutesLate(checkIn: string, start: Date) {
  return Math.max(1, Math.floor((Date.parse(checkIn) - start.getTime()) / 60_000));
}

/** "12.5" */
export function fmtHours(ms: number) {
  const h = ms / 3_600_000;
  return h >= 100 ? h.toFixed(0) : h.toFixed(1);
}

export function pct(n: number | null) {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}
