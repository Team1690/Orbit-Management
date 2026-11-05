import { computeAttendance, type AttendanceEntry } from "@/lib/attendance";
import { fmtTime, relativeDay } from "@/lib/format";
import { meetingWindow, meetingsBetween } from "@/lib/meetings";
import { listStudents } from "@/lib/members";
import { today } from "@/lib/periods";
import { addDays } from "@/lib/timeutil";
import { AttendanceBadge, Badge, Card, Empty, RsvpBadge } from "./ui";

// Who on one subteam is coming to the next meeting: for subteam leads (/subteam) and mentors (home).
// Read-only, and without RSVP reasons: only the answer and, for "late", how late.

/** RSVP groups in the order a lead acts on them: who hasn't answered first. */
const RSVP_ORDER = { none: 0, no: 1, late: 2, yes: 3 } as const;
/** During the meeting: who isn't here yet first. */
const ARRIVAL_ORDER: Record<AttendanceEntry["status"], number> = { missing: 0, absent: 1, late: 2, present: 3, upcoming: 4, not_required: 5 };

export async function SubteamNextMeeting({ subteam, title = "Next meeting" }: { subteam: string; title?: string }) {
  const t = today();
  const now = new Date();
  const team = (await listStudents()).filter((s) => s.subteam === subteam);
  const names = new Map(team.map((s) => [s.id, s.name]));

  // The next meeting with RSVPs that anyone on the subteam is expected at (or the one happening now).
  const upcoming = (await meetingsBetween(t, addDays(t, 14), false)).filter((m) => m.rsvp && meetingWindow(m).end > now);
  const attendance = await computeAttendance(
    upcoming,
    team.map((s) => s.id),
  );
  const next = upcoming.find((m) => (attendance.get(m.id)?.size ?? 0) > 0);
  if (!next) {
    return (
      <Card title={title}>
        <Empty>No meeting with RSVPs for {subteam} in the next two weeks.</Empty>
      </Card>
    );
  }

  const { start, end } = meetingWindow(next);
  const started = now >= start;
  // Before the start, who hasn't answered comes first; once it has started, who isn't here yet.
  const rows = [...attendance.get(next.id)!].sort(
    ([a, ea], [b, eb]) =>
      (started ? ARRIVAL_ORDER[ea.status] - ARRIVAL_ORDER[eb.status] : 0) ||
      RSVP_ORDER[ea.rsvp?.response ?? "none"] - RSVP_ORDER[eb.rsvp?.response ?? "none"] ||
      names.get(a)!.localeCompare(names.get(b)!),
  );
  const count = (response: "yes" | "late" | "no" | null) => rows.filter(([, e]) => (e.rsvp?.response ?? null) === response).length;

  return (
    <Card title={title}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold text-slate-900">{next.title}</span>
        <span className="text-slate-500">
          · {relativeDay(next.date)} {fmtTime(start)}–{fmtTime(end)}
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
        {rows.map(([id, e]) => (
          <li key={id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="truncate">{names.get(id)}</span>
            <span className="flex shrink-0 items-center gap-1">
              {started && <AttendanceBadge entry={e} />}
              <RsvpBadge response={e.rsvp?.response} lateByMin={e.rsvp?.late_by_min} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
