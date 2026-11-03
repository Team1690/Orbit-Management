import { all, one, run, tx } from "./db";

export type Visit = {
  id: number;
  user_id: number;
  check_in: string;
  check_out: string | null;
  in_method: "qr" | "manual" | "self";
  out_method: "self" | "auto" | "manual" | null;
};

export function openVisit(userId: number) {
  return one<Visit>("SELECT * FROM visits WHERE user_id = ? AND check_out IS NULL", userId);
}

export function checkIn(userId: number, method: Visit["in_method"], at = new Date()) {
  return tx(async () => {
    const existing = await openVisit(userId);
    if (existing) return { visit: existing, already: true };
    const visit = await one<Visit>(
      "INSERT INTO visits (user_id, check_in, in_method) VALUES (?, ?, ?) RETURNING *",
      userId,
      at.toISOString(),
      method,
    );
    return { visit: visit!, already: false };
  });
}

export async function checkOut(userId: number, method: NonNullable<Visit["out_method"]>, at = new Date()) {
  const open = await openVisit(userId);
  if (!open) return null;
  const out = new Date(Math.max(at.getTime(), Date.parse(open.check_in)));
  await run("UPDATE visits SET check_out = ?, out_method = ? WHERE id = ?", out.toISOString(), method, open.id);
  return open;
}

export type PresentMember = {
  visit_id: number;
  user_id: number;
  name: string;
  role: "member" | "captain" | "mentor";
  subteam: string | null;
  check_in: string;
};

export function presentNow() {
  return all<PresentMember>(
    `SELECT v.id AS visit_id, u.id AS user_id, u.name, u.role, u.subteam, v.check_in
       FROM visits v JOIN users u ON u.id = v.user_id
      WHERE v.check_out IS NULL
      ORDER BY v.check_in`,
  );
}

/** Milliseconds of `visit` that fall inside [from, to). Open visits count up to now. */
export function overlapMs(visit: Pick<Visit, "check_in" | "check_out">, from: number, to: number, now = Date.now()) {
  const start = Math.max(Date.parse(visit.check_in), from);
  const end = Math.min(visit.check_out ? Date.parse(visit.check_out) : now, to);
  return Math.max(0, end - start);
}

export function visitsBetween(from: Date, to: Date, userId?: number) {
  return all<Visit>(
    `SELECT * FROM visits
      WHERE check_in < ? AND (check_out IS NULL OR check_out > ?)
        AND (?::int IS NULL OR user_id = ?)
      ORDER BY check_in`,
    to.toISOString(),
    from.toISOString(),
    userId ?? null,
    userId ?? null,
  );
}

export type HoursTotal = { ms: number; visits: number };

export async function hoursByUser(from: Date, to: Date) {
  const totals = new Map<number, HoursTotal>();
  const now = Date.now();
  for (const v of await visitsBetween(from, to)) {
    const ms = overlapMs(v, from.getTime(), to.getTime(), now);
    const t = totals.get(v.user_id) ?? { ms: 0, visits: 0 };
    t.ms += ms;
    t.visits += 1;
    totals.set(v.user_id, t);
  }
  return totals;
}

export async function userHours(userId: number, from: Date, to: Date): Promise<HoursTotal> {
  const now = Date.now();
  let ms = 0;
  const visits = await visitsBetween(from, to, userId);
  for (const v of visits) ms += overlapMs(v, from.getTime(), to.getTime(), now);
  return { ms, visits: visits.length };
}

export function recentVisits(userId: number, limit = 20) {
  return all<Visit>("SELECT * FROM visits WHERE user_id = ? ORDER BY check_in DESC LIMIT ?", userId, limit);
}
