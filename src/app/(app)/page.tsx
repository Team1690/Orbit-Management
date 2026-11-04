import Link from "next/link";
import { checkOutSelf, mentorCheckIn } from "@/actions/presence";
import { SubmitButton } from "@/components/client";
import { MentorIcon, ScanIcon } from "@/components/icons";
import { InstallPrompt } from "@/components/install-prompt";
import { AttendanceBadge, Avatar, Badge, Banner, Card, Empty, RsvpBadge, Stat } from "@/components/ui";
import { computeAttendance, summarize, summaryFor } from "@/lib/attendance";
import { requireUser } from "@/lib/auth";
import { firstName, fmtDate, fmtDay, fmtDuration, fmtHours, fmtTime, pct, relativeDay } from "@/lib/format";
import { meetingWindow, meetingsBetween, openRsvpMeetings, rsvpsFor } from "@/lib/meetings";
import { mentorPlan } from "@/lib/mentors";
import { currentPeriod, thisWeek, today } from "@/lib/periods";
import { runTick } from "@/lib/tick";
import { addDays } from "@/lib/timeutil";
import { openVisit, recentVisits, userHours } from "@/lib/visits";
import { RsvpCard } from "./rsvp-card";

const FLASH = {
  ok: { tone: "green", text: "You're checked in. Have a great meeting!" },
  already: { tone: "blue", text: "You were already checked in." },
  expired: { tone: "yellow", text: "That code has expired. Scan the code on the screen again." },
} as const;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  await runTick();
  const { ci } = await searchParams;
  const flash = typeof ci === "string" && ci in FLASH ? FLASH[ci as keyof typeof FLASH] : null;

  const visit = await openVisit(user.id);
  const period = await currentPeriod();
  const week = thisWeek();
  const periodHours = await userHours(user.id, period.from, period.to);
  const weekHours = await userHours(user.id, week.from, week.to);
  const summary = summaryFor(await summarize(await meetingsBetween(period.startDate, period.endDate, false), [user.id]), user.id);

  const rsvpMeetings = await openRsvpMeetings();
  const myRsvps = new Map((await rsvpsFor(rsvpMeetings.map((m) => m.id))).filter((r) => r.user_id === user.id).map((r) => [r.meeting_id, r]));

  const t = today();
  const upcoming = (await meetingsBetween(t, addDays(t, 13), false)).filter((m) => meetingWindow(m).end > new Date()).slice(0, 6);
  const upcomingRsvps = new Map((await rsvpsFor(upcoming.map((m) => m.id))).filter((r) => r.user_id === user.id).map((r) => [r.meeting_id, r]));

  const past = (await meetingsBetween(addDays(t, -30), t, false))
    .filter((m) => meetingWindow(m).end <= new Date())
    .reverse()
    .slice(0, 6);
  const pastAttendance = await computeAttendance(past, [user.id]);
  const visits = await recentVisits(user.id, 5);

  const mentor = user.role === "mentor";
  const plan = await mentorPlan(t, 7);
  const mentorsToday = plan[0].entries.filter((e) => !e.skipped && e.mentorId !== user.id);
  const myVisits = plan.flatMap((d) => d.entries.filter((e) => e.mentorId === user.id).map((e) => ({ date: d.date, ...e })));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {flash && <Banner tone={flash.tone}>{flash.text}</Banner>}

      <div>
        <p className="text-sm text-slate-500">{fmtDate(t)}</p>
        <h1 className="text-2xl font-bold tracking-tight">Hi, {firstName(user.name)}</h1>
      </div>

      {visit ? (
        <div className="card card-pad flex items-center gap-4 border-emerald-200 bg-emerald-50">
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </span>
          <div className="flex-1">
            <div className="font-semibold text-emerald-900">You&apos;re at school</div>
            <div className="text-sm text-emerald-800">
              Since {fmtTime(visit.check_in)} · {fmtDuration(Date.now() - Date.parse(visit.check_in))}
            </div>
          </div>
          <form action={checkOutSelf}>
            <SubmitButton className="btn btn-secondary" pendingText="…">
              Check out
            </SubmitButton>
          </form>
        </div>
      ) : mentor ? (
        <div className="card card-pad flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <MentorIcon width={26} height={26} />
          </span>
          <div className="flex-1">
            <div className="font-semibold">Check in</div>
            <div className="text-sm text-slate-500">Mentors check in with one tap, no QR code needed.</div>
          </div>
          <form action={mentorCheckIn}>
            <SubmitButton className="btn btn-primary" pendingText="…">
              I&apos;m here
            </SubmitButton>
          </form>
        </div>
      ) : (
        <Link href="/scan" className="card card-pad flex items-center gap-4 transition hover:border-brand-300">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <ScanIcon width={26} height={26} />
          </span>
          <div className="flex-1">
            <div className="font-semibold">Check in</div>
            <div className="text-sm text-slate-500">Scan the QR code shown on the meeting slide.</div>
          </div>
          <span className="btn btn-primary">Scan</span>
        </Link>
      )}

      <InstallPrompt />

      {mentor && (
        <Card
          title="My visits this week"
          actions={
            <Link href="/mentors" className="link text-sm">
              Change
            </Link>
          }
        >
          {myVisits.length === 0 ? (
            <Empty>
              Nothing planned. <Link href="/mentors" className="link">Add your weekly times</Link> so the team knows when you&apos;re coming.
            </Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {myVisits.map((v) => (
                <li key={`${v.date}-${v.kind}-${v.slotId ?? v.changeId}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span className={v.skipped ? "text-slate-400 line-through" : ""}>
                    {relativeDay(v.date)} · {v.start}–{v.end}
                  </span>
                  {v.skipped ? <Badge tone="red">Can&apos;t come</Badge> : v.kind === "extra" ? <Badge tone="blue">Extra visit</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!mentor && mentorsToday.length > 0 && (
        <Card
          title="Mentors coming today"
          actions={
            <Link href="/mentors" className="link text-sm">
              All
            </Link>
          }
        >
          <ul className="space-y-2">
            {mentorsToday.map((e) => (
              <li key={`${e.kind}-${e.slotId ?? e.changeId}`} className="flex items-center gap-3 text-sm">
                <Avatar name={e.name} size={30} />
                <span className="flex-1">
                  <span className="font-medium">{e.name}</span>
                  {e.note && <span className="block text-xs text-slate-500">{e.note}</span>}
                </span>
                <span className="text-slate-600 tabular-nums">
                  {e.start}–{e.end}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!mentor && rsvpMeetings.map((m) => {
        const { start, end } = meetingWindow(m);
        const r = myRsvps.get(m.id);
        return (
          <RsvpCard
            key={m.id}
            meetingId={m.id}
            title={m.title}
            when={`${relativeDay(m.date)} · ${fmtTime(start)}–${fmtTime(end)}`}
            current={r?.response ?? null}
            currentNote={r?.note ?? null}
            currentLateBy={r?.late_by_min ?? null}
          />
        );
      })}

      <div className={`grid gap-3 ${mentor ? "grid-cols-2" : "grid-cols-3"}`}>
        <Stat label="This week" value={fmtHours(weekHours.ms)} hint="hours" />
        <Stat label="Season" value={fmtHours(periodHours.ms)} hint={`hours · ${period.label}`} />
        {!mentor && (
          <Stat
            label="Attendance"
            value={pct(summary.rate)}
            hint={`${summary.meetings} meetings`}
            tone={summary.rate === null ? "default" : summary.rate >= 0.85 ? "good" : summary.rate >= 0.7 ? "warn" : "bad"}
          />
        )}
      </div>

      <Card title="Coming up">
        {upcoming.length === 0 ? (
          <Empty>No meetings scheduled in the next two weeks.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((m) => {
              const { start, end } = meetingWindow(m);
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{m.title}</div>
                    <div className="text-xs text-slate-500">
                      {relativeDay(m.date)} · {fmtTime(start)}–{fmtTime(end)}
                      {!m.mandatory && " · optional"}
                    </div>
                  </div>
                  {m.rsvp && !mentor ? (
                    <RsvpBadge response={upcomingRsvps.get(m.id)?.response} lateByMin={upcomingRsvps.get(m.id)?.late_by_min} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="My recent attendance" className={mentor ? "hidden" : ""}>
        {past.length === 0 ? (
          <Empty>No past meetings yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {past.map((m) => {
              const entry = pastAttendance.get(m.id)?.get(user.id);
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{m.title}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDate(m.date)}
                      {entry?.firstIn && ` · arrived ${fmtTime(entry.firstIn)}`}
                    </div>
                  </div>
                  <AttendanceBadge entry={entry} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="My recent visits">
        {visits.length === 0 ? (
          <Empty>No visits yet. Scan the code at your next meeting.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visits.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  {fmtDay(v.check_in)} · {fmtTime(v.check_in)}–{v.check_out ? fmtTime(v.check_out) : "now"}
                  {v.out_method === "auto" && <span className="ml-1 text-xs text-amber-600">(auto check-out)</span>}
                </span>
                <span className="font-medium tabular-nums">
                  {fmtDuration((v.check_out ? Date.parse(v.check_out) : Date.now()) - Date.parse(v.check_in))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
