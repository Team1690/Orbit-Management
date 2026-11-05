import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AttendanceBadge, Avatar, Badge, Card, Empty, PageHeader, RsvpBadge } from "@/components/ui";
import { computeAttendance, summaryFor, totalsFrom, type AttendanceEntry } from "@/lib/attendance";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtTime, pct, relativeDay } from "@/lib/format";
import { meetingWindow, meetingsBetween, type Meeting } from "@/lib/meetings";
import { getMember, listStudents } from "@/lib/members";
import { currentPeriod, today } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { addDays } from "@/lib/timeutil";

export const metadata: Metadata = { title: "My subteam" };

// A subteam lead's read-only view of their own subteam, made for a quick look on a phone:
// who is coming to the next meeting, who is flagged (the captains' thresholds from Settings),
// and each member's attendance. No reasons or contact details, and nothing can be changed here.

const HISTORY = 8;

/** RSVP groups in the order a lead acts on them: who hasn't answered first. */
const RSVP_ORDER = { none: 0, no: 1, late: 2, yes: 3 } as const;
/** During the meeting: who isn't here yet first. */
const ARRIVAL_ORDER: Record<AttendanceEntry["status"], number> = { missing: 0, absent: 1, late: 2, present: 3, upcoming: 4, not_required: 5 };

function rateTone(rate: number | null) {
  return rate === null ? "text-slate-400" : rate >= 0.85 ? "text-emerald-600" : rate >= 0.7 ? "text-amber-600" : "text-rose-600";
}

export default async function SubteamPage() {
  const user = await requireUser();
  if (user.role !== "member" || !user.subteam_lead) redirect("/");
  const me = await getMember(user.id);
  if (!me?.subteam) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="My subteam" />
        <Card>
          <Empty>You don&apos;t have a subteam yet. Ask a captain to set it.</Empty>
        </Card>
      </div>
    );
  }

  const t = today();
  const now = new Date();
  const monthStart = addDays(t, -29);
  const [period, settings, students] = await Promise.all([currentPeriod(), getSettings(), listStudents()]);
  const team = students.filter((s) => s.subteam === me.subteam);
  const ids = team.map((s) => s.id);
  const from = period.startDate < monthStart ? period.startDate : monthStart;
  const [past, soon] = await Promise.all([meetingsBetween(from, t, false), meetingsBetween(t, addDays(t, 14), false)]);

  // One attendance lookup for everything finished: the season's totals, the last 30 days' flags and the history.
  const finished = past.filter((m) => meetingWindow(m).end <= now);
  const attendance = await computeAttendance(finished, ids);
  const rows = (pick: (date: string) => boolean) =>
    finished.filter((m) => m.mandatory && pick(m.date)).map((m) => attendance.get(m.id) ?? new Map<number, AttendanceEntry>());
  const season = totalsFrom(rows((d) => d >= period.startDate && d <= period.endDate));
  const month = totalsFrom(rows((d) => d >= monthStart));

  /** The member's latest meetings this season, newest first; optional meetings only when they came. */
  const history = (id: number) =>
    finished
      .filter((m) => m.date >= period.startDate)
      .map((m) => ({ m, e: attendance.get(m.id)?.get(id) }))
      .filter((h): h is { m: Meeting; e: AttendanceEntry } => !!h.e && h.e.status !== "not_required")
      .reverse()
      .slice(0, HISTORY);

  // The next meeting with RSVPs that anyone on the subteam is expected at (or the one happening now).
  const upcoming = soon.filter((m) => m.rsvp && meetingWindow(m).end > now);
  const upcomingAttendance = await computeAttendance(upcoming, ids);
  const next = upcoming.find((m) => (upcomingAttendance.get(m.id)?.size ?? 0) > 0);
  const nextWindow = next ? meetingWindow(next) : null;
  const started = !!nextWindow && now >= nextWindow.start;
  // Before the start, who hasn't answered comes first; once it has started, who isn't here yet.
  const nextRows = next
    ? [...upcomingAttendance.get(next.id)!].sort(
        ([a, ea], [b, eb]) =>
          (started ? ARRIVAL_ORDER[ea.status] - ARRIVAL_ORDER[eb.status] : 0) ||
          RSVP_ORDER[ea.rsvp?.response ?? "none"] - RSVP_ORDER[eb.rsvp?.response ?? "none"] ||
          team.find((s) => s.id === a)!.name.localeCompare(team.find((s) => s.id === b)!.name),
      )
    : [];
  const count = (response: "yes" | "late" | "no" | null) => nextRows.filter(([, e]) => (e.rsvp?.response ?? null) === response).length;

  const { flag_absences, flag_lates } = settings;
  const flagged = team
    .map((s) => {
      const m = summaryFor(month, s.id);
      return { s, absent: flag_absences > 0 && m.absent >= flag_absences ? m.absent : 0, late: flag_lates > 0 && m.late >= flag_lates ? m.late : 0 };
    })
    .filter((f) => f.absent || f.late)
    .sort((a, b) => b.absent - a.absent || b.late - a.late);
  const flags = new Map(flagged.map((f) => [f.s.id, f]));
  const thresholds = [flag_absences > 0 && `${flag_absences}+ absences`, flag_lates > 0 && `${flag_lates}+ late arrivals`].filter(Boolean).join(" or ");
  const name = (id: number) => team.find((s) => s.id === id)!.name;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={me.subteam} subtitle={`${team.length} members · view only`} />

      <Card title="Next meeting">
        {!next || !nextWindow ? (
          <Empty>No meeting with RSVPs in the next two weeks.</Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-semibold text-slate-900">{next.title}</span>
              <span className="text-slate-500">
                · {relativeDay(next.date)} {fmtTime(nextWindow.start)}–{fmtTime(nextWindow.end)}
              </span>
              {started && <Badge tone="green">Happening now</Badge>}
            </div>
            <div className="mb-3 grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Coming", n: count("yes"), tone: "text-emerald-600" },
                { label: "Late", n: count("late"), tone: "text-amber-600" },
                { label: "Can't come", n: count("no"), tone: "text-rose-600" },
                { label: "No answer", n: count(null), tone: "text-slate-700" },
              ].map((c) => (
                <div key={c.label} className="rounded-xl bg-slate-50 py-2">
                  <div className={`text-xl font-bold tabular-nums ${c.tone}`}>{c.n}</div>
                  <div className="text-[11px] font-medium text-slate-500">{c.label}</div>
                </div>
              ))}
            </div>
            <ul className="divide-y divide-slate-100">
              {nextRows.map(([id, e]) => (
                <li key={id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="truncate">{name(id)}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {started && <AttendanceBadge entry={e} />}
                    <RsvpBadge response={e.rsvp?.response} lateByMin={e.rsvp?.late_by_min} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {flagged.length > 0 && (
        <Card title="Needs attention">
          <p className="mb-2 text-xs text-slate-500">Last 30 days · flagged at {thresholds}, as set by the captains.</p>
          <ul className="divide-y divide-slate-100">
            {flagged.map((f) => (
              <li key={f.s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">{f.s.name}</span>
                <span className="flex shrink-0 gap-1">
                  {f.absent > 0 && <Badge tone="red">{f.absent}× absent</Badge>}
                  {f.late > 0 && <Badge tone="yellow">{f.late}× late</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Attendance · ${period.label}`} pad={false}>
        {team.length === 0 ? (
          <Empty>No active members on {me.subteam}.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {team.map((s) => {
              const sum = summaryFor(season, s.id);
              const f = flags.get(s.id);
              const recent = history(s.id);
              return (
                <li key={s.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                      <Avatar name={s.name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{s.name}</span>
                        {f && (
                          <span className="mt-0.5 flex gap-1">
                            {f.absent > 0 && <Badge tone="red">{f.absent}× absent</Badge>}
                            {f.late > 0 && <Badge tone="yellow">{f.late}× late</Badge>}
                          </span>
                        )}
                      </span>
                      <span className={`text-sm font-semibold tabular-nums ${rateTone(sum.rate)}`}>{pct(sum.rate)}</span>
                      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" className="shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true">
                        <path d="M5.2 7.6a.75.75 0 0 1 1.06-.04L10 11.1l3.74-3.54a.75.75 0 1 1 1.02 1.1l-4.25 4a.75.75 0 0 1-1.02 0l-4.25-4a.75.75 0 0 1-.04-1.06Z" />
                      </svg>
                    </summary>
                    <div className="px-4 pb-3 sm:px-5">
                      <p className="mb-2 text-xs text-slate-500">
                        {sum.meetings} required meetings · {sum.present} on time · {sum.late} late · {sum.absent} absent
                        {sum.absentNotice > 0 && ` (${sum.absentNotice} with notice)`}
                      </p>
                      {recent.length === 0 ? (
                        <p className="text-xs text-slate-400">No meetings yet this season.</p>
                      ) : (
                        <ul className="space-y-1">
                          {recent.map(({ m, e }) => (
                            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate text-slate-600">
                                {fmtDate(m.date)} · {m.title}
                              </span>
                              <AttendanceBadge entry={e} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
