import type { Metadata } from "next";
import Link from "next/link";
import { captainCheckIn, captainCheckOut, checkOutEveryone } from "@/actions/presence";
import { AutoRefresh, ConfirmButton, CopyButton, SubmitButton } from "@/components/client";
import { AlertIcon, MonitorIcon, PlusIcon } from "@/components/icons";
import { PushToggle } from "@/components/push-toggle";
import { Avatar, Badge, Banner, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { alertsToday } from "@/lib/alerts";
import { computeAttendance, summarize, type AttendanceEntry, type AttendanceSummary } from "@/lib/attendance";
import { requireCaptain } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate, fmtDay, fmtDuration, fmtHours, fmtTime, minutesLate, pct, relativeDay } from "@/lib/format";
import { rsvpDetail } from "@/lib/late-by";
import { audienceLabel, parseAudience } from "@/lib/audience";
import { meetingWindow, meetingsBetween, type Meeting } from "@/lib/meetings";
import { listMembers, type Member } from "@/lib/members";
import { mentorPlan } from "@/lib/mentors";
import { currentPeriod, today } from "@/lib/periods";
import { vapidPublicKey } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { runTick } from "@/lib/tick";
import { addDays } from "@/lib/timeutil";
import { hoursByUser, presentNow } from "@/lib/visits";

export const metadata: Metadata = { title: "Dashboard" };

function NameList({ ids, members, detail }: { ids: number[]; members: Map<number, Member>; detail?: (id: number) => string | null }) {
  if (ids.length === 0) return <p className="text-sm text-slate-400">Nobody</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const extra = detail?.(id);
        return (
          <li key={id}>
            <Link
              href={`/members/${id}`}
              className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
              title={extra ?? undefined}
            >
              {members.get(id)?.name ?? "?"}
              {extra && <span className="ml-1 max-w-40 truncate font-normal text-slate-500">· {extra}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function MeetingPanel({ meeting, members }: { meeting: Meeting; members: Map<number, Member> }) {
  const { start, end } = meetingWindow(meeting);
  const now = new Date();
  const started = now >= start;
  const forWho = audienceLabel(parseAudience(meeting.audience));
  const rows = [...((await computeAttendance([meeting])).get(meeting.id) ?? new Map<number, AttendanceEntry>())];
  const by = (pred: (e: AttendanceEntry) => boolean) => rows.filter(([, e]) => pred(e)).map(([id]) => id);

  const coming = by((e) => e.rsvp?.response === "yes");
  const late = by((e) => e.rsvp?.response === "late");
  const no = by((e) => e.rsvp?.response === "no");
  const noAnswer = by((e) => !e.rsvp);
  const arrived = by((e) => e.status === "present" || e.status === "late");
  const notHere = (e: AttendanceEntry) => e.status === "missing" || e.status === "absent";
  const missingNoNotice = by((e) => notHere(e) && !e.notice);
  const expectedLate = by((e) => notHere(e) && e.notice && e.rsvp?.response === "late");
  const missingNotice = by((e) => notHere(e) && e.notice && e.rsvp?.response !== "late");
  const lateArrivals = rows
    .filter(([, e]) => e.status === "late" && e.firstIn)
    .sort(([, a], [, b]) => Date.parse(b.firstIn!) - Date.parse(a.firstIn!));
  /** How late they said they'd be, and their note. */
  const detail = (id: number) => {
    const rsvp = rows.find(([u]) => u === id)?.[1].rsvp;
    return rsvp ? rsvpDetail(rsvp) : null;
  };

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>
            {started ? "Now: " : "Next: "}
            {meeting.title} · {relativeDay(meeting.date)} {fmtTime(start)}–{fmtTime(end)}
          </span>
          <Badge>{meeting.schedule_id === null ? "One-off" : "Weekly"}</Badge>
          {forWho && <Badge tone="blue">For: {forWho}</Badge>}
        </span>
      }
      actions={
        <Link href={`/meetings/${meeting.id}`} className="link text-sm">
          Full sheet
        </Link>
      }
    >
      {started && (
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold">Arrived</span>
            <span className="text-sm text-slate-500 tabular-nums">
              {arrived.length} / {rows.length}
            </span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rows.length ? (arrived.length / rows.length) * 100 : 0}%` }} />
          </div>
          <div className="space-y-3">
            {lateArrivals.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 text-xs font-semibold tracking-wide text-amber-700 uppercase">
                  Checked in late ({lateArrivals.length}) · after {fmtTime(start)}
                </div>
                <ul className="space-y-1">
                  {lateArrivals.map(([id, e]) => (
                    <li key={id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/members/${id}`} className="font-medium text-amber-950 hover:underline">
                        {members.get(id)?.name}
                        {e.notice && <span className="ml-1.5 text-xs font-normal text-amber-700">notified</span>}
                      </Link>
                      <span className="text-xs text-amber-800 tabular-nums">
                        {fmtTime(e.firstIn!)} · <strong>+{minutesLate(e.firstIn!, start)} min</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-rose-600 uppercase">
                {now < end ? "Not checked in, no notice" : "Absent, no notice"} ({missingNoNotice.length})
              </div>
              <NameList ids={missingNoNotice} members={members} />
            </div>
            {expectedLate.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold tracking-wide text-amber-600 uppercase">Said they&apos;d be late ({expectedLate.length})</div>
                <NameList ids={expectedLate} members={members} detail={detail} />
              </div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-violet-600 uppercase">
                {expectedLate.length > 0 ? "Can't come, gave notice" : "Gave notice"} ({missingNotice.length})
              </div>
              <NameList ids={missingNotice} members={members} detail={detail} />
            </div>
          </div>
        </div>
      )}

      {meeting.rsvp ? (
        <div className={started ? "border-t border-slate-100 pt-4" : ""}>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Coming", n: coming.length, cls: "text-emerald-600" },
              { label: "Late", n: late.length, cls: "text-amber-600" },
              { label: "Can't", n: no.length, cls: "text-rose-600" },
              { label: "No answer", n: noAnswer.length, cls: "text-slate-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 py-2">
                <div className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.n}</div>
                <div className="text-[11px] font-medium text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
          {!started && (
            <div className="space-y-3">
              {late.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-amber-600 uppercase">Coming late ({late.length})</div>
                  <NameList ids={late} members={members} detail={detail} />
                </div>
              )}
              {no.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold tracking-wide text-rose-600 uppercase">Can&apos;t come ({no.length})</div>
                  <NameList ids={no} members={members} detail={detail} />
                </div>
              )}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Haven&apos;t answered</span>
                  {noAnswer.length > 0 && (
                    <CopyButton
                      value={`Reminder: please answer the RSVP for ${meeting.title} (${fmtDate(meeting.date)}) in the Orbit app 🙏\n${noAnswer
                        .map((id) => members.get(id)?.name)
                        .join(", ")}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Copy reminder
                    </CopyButton>
                  )}
                </div>
                <NameList ids={noAnswer} members={members} />
              </div>
            </div>
          )}
        </div>
      ) : (
        !started && <p className="text-sm text-slate-500">RSVPs are off for this meeting.</p>
      )}
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireCaptain();
  await runTick();
  const { welcome } = await searchParams;

  const t = today();
  const period = await currentPeriod();
  const [members, present, alerts, settings, mentorPlanToday, hours, soon, summaries, monthSummaries, autoClosed, publicKey] =
    await Promise.all([
      listMembers(),
      presentNow(),
      alertsToday(),
      getSettings(),
      mentorPlan(t, 1),
      hoursByUser(period.from, period.to),
      meetingsBetween(t, addDays(t, 14), false),
      meetingsBetween(period.startDate, t, false).then((ms) => summarize(ms)),
      meetingsBetween(addDays(t, -29), t, false).then((ms) => summarize(ms)),
      all<{ id: number; user_id: number; check_in: string; check_out: string }>(
        "SELECT id, user_id, check_in, check_out FROM visits WHERE out_method = 'auto' AND check_in > ? ORDER BY check_in DESC LIMIT 10",
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      ),
      vapidPublicKey(),
    ]);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const students = new Set(members.filter((m) => m.role !== "mentor").map((m) => m.id));
  const studentsHere = present.filter((p) => students.has(p.user_id)).length;
  const mentorsHere = present.length - studentsHere;
  const mentorsToday = mentorPlanToday[0].entries;
  const presentIds = new Set(present.map((p) => p.user_id));
  const teamMs = [...hours].filter(([id]) => students.has(id)).reduce((sum, [, h]) => sum + h.ms, 0);

  // The weekly meeting happening now or next, and the next one-off meeting if there's one this week.
  const notOver = soon.filter((m) => meetingWindow(m).end > new Date());
  const nextWeekly = notOver.find((m) => m.schedule_id !== null);
  const nextOneOff = notOver.find((m) => m.schedule_id === null && m.date <= addDays(t, 7));
  const panels = [nextWeekly, nextOneOff]
    .filter((m): m is Meeting => !!m)
    .sort((a, b) => meetingWindow(a).start.getTime() - meetingWindow(b).start.getTime());

  const lowAttendance = [...summaries]
    .filter(([id, s]) => memberMap.has(id) && s.meetings >= 3 && (s.rate ?? 1) < 0.7)
    .sort((a, b) => (a[1].rate ?? 0) - (b[1].rate ?? 0))
    .slice(0, 8);
  const { missing_alert_min, flag_absences, flag_lates } = settings;
  /** Members whose count over the last 30 days reached the threshold from Settings (0 = off), highest first. */
  const flagged = (count: (s: AttendanceSummary) => number, threshold: number) =>
    threshold > 0
      ? [...monthSummaries].filter(([id, s]) => memberMap.has(id) && count(s) >= threshold).sort((a, b) => count(b[1]) - count(a[1]))
      : [];
  const manyAbsences = flagged((s) => s.absent, flag_absences);
  const manyLates = flagged((s) => s.late, flag_lates);
  const notJoined = members.filter((m) => !m.has_password);
  const leaders = [...hours]
    .filter(([id]) => students.has(id))
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 8);

  const attentionPeople = new Set([
    ...lowAttendance.map(([id]) => id),
    ...manyAbsences.map(([id]) => id),
    ...manyLates.map(([id]) => id),
    ...autoClosed.map((v) => v.user_id),
  ]);
  const attentionCount = attentionPeople.size + (notJoined.length ? 1 : 0);

  return (
    <div>
      <AutoRefresh seconds={20} />
      <PageHeader
        title="Dashboard"
        subtitle={`${fmtDate(t)} · ${period.label}`}
        actions={
          <>
            <a href="/qr" target="_blank" className="btn btn-primary">
              <MonitorIcon /> Show check-in code
            </a>
            <Link href="/members/new" className="btn btn-secondary">
              <PlusIcon /> Add members
            </Link>
          </>
        }
      />

      {welcome && (
        <Banner tone="blue">
          Your team is set up. Next: add your weekly meeting times on the <Link href="/meetings" className="link">Meetings</Link> page,
          then <Link href="/members/new" className="link">add your members</Link>.
        </Banner>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="At school now"
          value={studentsHere}
          hint={`of ${students.size} students${mentorsHere ? ` · +${mentorsHere} mentor${mentorsHere === 1 ? "" : "s"}` : ""}`}
          tone={studentsHere ? "good" : "default"}
        />
        <Stat label="Team hours" value={fmtHours(teamMs)} hint={period.label} href="/hours" />
        <Stat
          label="Avg attendance"
          value={pct(avgRate(summaries, memberMap))}
          hint={period.label}
          href="/members"
        />
        <Stat label="Needs attention" value={attentionPeople.size} tone={attentionCount ? "warn" : "good"} hint="members flagged below" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {panels.length > 0 ? (
            panels.map((m) => <MeetingPanel key={m.id} meeting={m} members={memberMap} />)
          ) : (
            <Card title="Meetings">
              <Empty>
                No upcoming meetings. <Link href="/meetings" className="link">Set up the weekly schedule</Link>.
              </Empty>
            </Card>
          )}

          <Card
            title={`At school now (${present.length})`}
            actions={
              present.length > 0 && (
                <form action={checkOutEveryone}>
                  <ConfirmButton message="Check out everyone who is still checked in?" className="text-xs font-medium text-rose-600 hover:underline">
                    Check out everyone
                  </ConfirmButton>
                </form>
              )
            }
            pad={false}
          >
            {present.length === 0 ? (
              <Empty>Nobody is checked in right now.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {present.map((p) => (
                  <li key={p.visit_id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <Avatar name={p.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/members/${p.user_id}`} className="flex items-center gap-1.5 truncate text-sm font-medium hover:underline">
                        {p.name}
                        {p.role === "mentor" && <Badge tone="purple">Mentor</Badge>}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {p.subteam ?? "No subteam"} · since {fmtTime(p.check_in)} ({fmtDuration(Date.now() - Date.parse(p.check_in))})
                      </div>
                    </div>
                    <form action={captainCheckOut}>
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <SubmitButton className="btn btn-secondary btn-sm">Check out</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={captainCheckIn} className="flex gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
              <select name="user_id" required className="input" defaultValue="">
                <option value="" disabled>
                  Check someone in manually…
                </option>
                {members
                  .filter((m) => !presentIds.has(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <SubmitButton className="btn btn-secondary shrink-0">Check in</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Alerts" actions={<span className="text-xs text-slate-500">Today</span>}>
            {alerts.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">
                Nothing yet today. {missing_alert_min} minutes after each meeting starts, you get a list of everyone who hasn&apos;t checked in.
              </p>
            ) : (
              <ul className="mb-3 space-y-2">
                {alerts.map((a) => (
                  <li key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <Link href={a.meeting_id ? `/meetings/${a.meeting_id}` : "/dashboard"} className="text-sm font-semibold text-amber-950 hover:underline">
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-amber-900">{a.body}</p>
                    <p className="mt-1 text-[11px] text-amber-700">{fmtTime(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
            <PushToggle publicKey={publicKey} />
          </Card>

          <Card title={<span className="flex items-center gap-1.5"><AlertIcon width={16} height={16} className="text-amber-500" /> Needs attention</span>}>
            {attentionCount === 0 ? (
              <Empty>All good.</Empty>
            ) : (
              <div className="space-y-4 text-sm">
                {manyAbsences.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Absent {flag_absences}+ times · last 30 days
                    </div>
                    <ul className="space-y-1">
                      {manyAbsences.slice(0, 8).map(([id, s]) => (
                        <li key={id} className="flex justify-between gap-2">
                          <Link href={`/members/${id}`} className="truncate hover:underline">
                            {memberMap.get(id)!.name}
                          </Link>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {s.absent > s.absentNotice && <span className="text-xs text-slate-500">{s.absent - s.absentNotice} without notice</span>}
                            <Badge tone="red">{s.absent}×</Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {manyLates.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Late {flag_lates}+ times · last 30 days</div>
                    <ul className="space-y-1">
                      {manyLates.slice(0, 8).map(([id, s]) => (
                        <li key={id} className="flex justify-between gap-2">
                          <Link href={`/members/${id}`} className="truncate hover:underline">
                            {memberMap.get(id)!.name}
                          </Link>
                          <Badge tone="yellow">{s.late}×</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {lowAttendance.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Attendance under 70%</div>
                    <ul className="space-y-1">
                      {lowAttendance.map(([id, s]) => (
                        <li key={id} className="flex justify-between">
                          <Link href={`/members/${id}`} className="hover:underline">
                            {memberMap.get(id)!.name}
                          </Link>
                          <Badge tone="yellow">{pct(s.rate)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {autoClosed.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Forgot to check out · last 7 days</div>
                    <ul className="space-y-1">
                      {autoClosed.map((v) => (
                        <li key={v.id} className="flex justify-between gap-2">
                          <Link href={`/members/${v.user_id}#visits`} className="truncate hover:underline">
                            {memberMap.get(v.user_id)?.name ?? "Former member"}
                          </Link>
                          <span className="shrink-0 text-xs text-slate-500">
                            {fmtDay(v.check_in)} {fmtTime(v.check_in)}–{fmtTime(v.check_out)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {notJoined.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Haven&apos;t set a password</div>
                    <p className="text-slate-600">
                      {notJoined.length} member{notJoined.length === 1 ? "" : "s"}.{" "}
                      <Link href="/members?filter=not_joined" className="link">
                        See who
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Mentors today" actions={<Link href="/mentors" className="link text-sm">Schedule</Link>}>
            {mentorsToday.length === 0 ? (
              <p className="text-sm text-slate-500">No mentor visits planned today.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {mentorsToday.map((e) => (
                  <li key={`${e.kind}-${e.slotId ?? e.changeId}`} className={`flex items-center justify-between gap-2 ${e.skipped ? "text-slate-400" : ""}`}>
                    <Link href={`/members/${e.mentorId}`} className={`truncate hover:underline ${e.skipped ? "line-through" : ""}`}>
                      {e.name}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums">
                      {e.skipped ? "can't come" : `${e.start}–${e.end}`}
                      {present.some((p) => p.user_id === e.mentorId) && <Badge tone="green">here</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Most hours · ${period.label}`} actions={<Link href="/hours" className="link text-sm">All</Link>}>
            {leaders.length === 0 ? (
              <Empty>No hours logged yet.</Empty>
            ) : (
              <ol className="space-y-2">
                {leaders.map(([id, h], i) => (
                  <li key={id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-right text-xs font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                    <Link href={`/members/${id}`} className="flex-1 truncate hover:underline">
                      {memberMap.get(id)!.name}
                    </Link>
                    <span className="font-semibold tabular-nums">{fmtHours(h.ms)}h</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function avgRate(summaries: Awaited<ReturnType<typeof summarize>>, members: Map<number, Member>) {
  const rates = [...summaries].filter(([id, s]) => members.has(id) && s.rate !== null).map(([, s]) => s.rate!);
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}
