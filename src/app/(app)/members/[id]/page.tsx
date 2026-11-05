import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, addVisit, deleteNote, deleteVisit, makeInviteLink, updateVisit } from "@/actions/members";
import { captainCheckIn, captainCheckOut } from "@/actions/presence";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/client";
import { AttendanceBadge, Avatar, Badge, Card, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { computeAttendance, summarize, summaryFor } from "@/lib/attendance";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtDay, fmtDuration, fmtHours, fmtTime, pct } from "@/lib/format";
import { rsvpDetail } from "@/lib/late-by";
import { WEEKDAY_NAMES, meetingWindow, meetingsBetween } from "@/lib/meetings";
import { mentorSlots } from "@/lib/mentors";
import { subjectsText } from "@/components/member-fields";
import { getMember, notesFor, hasRoleBadge, roleLabel } from "@/lib/members";
import { currentPeriod, listSeasons, seasonPeriod, thisWeek, today } from "@/lib/periods";
import { tz } from "@/lib/settings";
import { localParts } from "@/lib/timeutil";
import { openVisit, recentVisits, userHours } from "@/lib/visits";
import { VisitRow } from "@/components/visit-row";

export const metadata: Metadata = { title: "Member" };

const METHOD_LABEL: Record<string, string> = { auto: "auto check-out", manual: "edited by captain" };

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm break-words whitespace-pre-line text-slate-900">{value || "—"}</dd>
    </div>
  );
}

export default async function MemberPage({ params }: PageProps<"/members/[id]">) {
  const me = await requireStaff();
  /** Meeting sheets and Settings are captain-only, so lead mentors get plain text there. */
  const captain = me.role === "captain";
  const id = Number((await params).id);
  const m = await getMember(id);
  if (!m) notFound();

  const zone = tz();
  const t = today();
  const period = await currentPeriod();
  const week = thisWeek();
  const periodHours = await userHours(id, period.from, period.to);
  const weekHours = await userHours(id, week.from, week.to);
  const allTime = await userHours(id, new Date(0), new Date(Date.now() + 86_400_000));
  const periodMeetings = await meetingsBetween(period.startDate, t, false);
  const s = summaryFor(await summarize(periodMeetings, [id]), id);

  const started = periodMeetings.filter((mt) => meetingWindow(mt).start <= new Date());
  const attendance = await computeAttendance(started, [id]);
  // Only meetings they were expected at (the whole team, one of their teams, or picked by name).
  const history = started
    .filter((mt) => attendance.get(mt.id)?.has(id))
    .reverse()
    .slice(0, 20);
  const visit = await openVisit(id);
  const visits = await recentVisits(id, 15);
  const notes = await notesFor(id);
  const seasons = await Promise.all(
    (await listSeasons()).map(async (season) => ({ season, hours: await userHours(id, seasonPeriod(season).from, seasonPeriod(season).to) })),
  );
  const isMentor = m.role === "mentor";
  const weeklyTimes = isMentor ? await mentorSlots(id) : [];

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={m.name} size={44} />
            <span>{m.name}</span>
          </span>
        }
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {hasRoleBadge(m) && <Badge tone={m.role === "mentor" ? "purple" : "blue"}>{roleLabel(m)}</Badge>}
            {m.subteam && <Badge>{m.subteam}</Badge>}
            {m.teams.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {m.grade && <Badge>Grade {m.grade}</Badge>}
            {!m.active && <Badge tone="red">Inactive</Badge>}
            {visit ? <Badge tone="green">At school since {fmtTime(visit.check_in)}</Badge> : null}
          </span>
        }
        actions={
          <>
            <form action={visit ? captainCheckOut : captainCheckIn}>
              <input type="hidden" name="user_id" value={id} />
              <SubmitButton className="btn btn-secondary">{visit ? "Check out" : "Check in"}</SubmitButton>
            </form>
            <Link href={`/members/${id}/edit`} className="btn btn-primary">
              Edit profile
            </Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Hours · ${period.label}`} value={fmtHours(periodHours.ms)} hint={`${periodHours.visits} visits · ${fmtHours(weekHours.ms)}h this week`} />
        <Stat label="All-time hours" value={fmtHours(allTime.ms)} hint={`${allTime.visits} visits`} />
        {isMentor ? (
          <div className="card card-pad col-span-2">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Weekly times</div>
            {weeklyTimes.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">No regular times announced yet.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-sm">
                {weeklyTimes.map((w) => (
                  <li key={w.id}>
                    <span className="font-medium">{WEEKDAY_NAMES[w.weekday]}</span> {w.start_time}–{w.end_time}
                    {w.note && <span className="text-slate-500"> · {w.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <Stat
              label="Attendance"
              value={pct(s.rate)}
              hint={`${s.present + s.late} of ${s.meetings} meetings · ${s.late} late`}
              tone={s.rate === null ? "default" : s.rate >= 0.85 ? "good" : s.rate >= 0.7 ? "warn" : "bad"}
            />
            <Stat
              label="Absences"
              value={s.absent}
              hint={`${s.absentNotice} with notice · ${s.noShows} said yes but didn't come`}
              tone={s.absent - s.absentNotice > 0 ? "bad" : "default"}
            />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Captain notes" actions={<Badge tone="purple">Captains only</Badge>}>
            <ActionForm action={addNote.bind(null, id)} className="mb-4 flex flex-col gap-2">
              <textarea name="body" rows={2} required placeholder="Add a private note…" className="input" />
              <div>
                <SubmitButton className="btn btn-primary btn-sm">Add note</SubmitButton>
              </div>
            </ActionForm>
            {notes.length === 0 ? (
              <p className="text-sm text-slate-400">No notes yet.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-sm whitespace-pre-line text-slate-800">{n.body}</p>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {n.author_name ?? "Former captain"} · {fmtDateTime(n.created_at)}
                      </span>
                      <form action={deleteNote}>
                        <input type="hidden" name="id" value={n.id} />
                        <ConfirmButton message="Delete this note?" className="text-rose-600 hover:underline">
                          Delete
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Attendance · ${period.label}`} pad={false} className={isMentor ? "hidden" : ""}>
            {history.length === 0 ? (
              <Empty>No meetings in this period yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((mt) => {
                  const e = attendance.get(mt.id)?.get(id);
                  return (
                    <li key={mt.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <div className="min-w-0 flex-1">
                        {captain ? (
                          <Link href={`/meetings/${mt.id}`} className="text-sm font-medium hover:underline">
                            {mt.title} · {fmtDate(mt.date)}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">
                            {mt.title} · {fmtDate(mt.date)}
                          </span>
                        )}
                        <div className="truncate text-xs text-slate-500">
                          {e?.firstIn ? `Arrived ${fmtTime(e.firstIn)}` : "No check-in"}
                          {e?.rsvp && e.rsvp.response !== "yes" && rsvpDetail(e.rsvp) && ` · "${rsvpDetail(e.rsvp)}"`}
                          {e?.overridden && " · set by captain"}
                        </div>
                      </div>
                      <AttendanceBadge entry={e} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Visits" pad={false}>
            <div id="visits" />
            {visits.length === 0 ? (
              <Empty>No visits yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visits.map((v) => {
                  const inLocal = localParts(new Date(v.check_in), zone);
                  const outLocal = v.check_out ? localParts(new Date(v.check_out), zone) : null;
                  const ms = (v.check_out ? Date.parse(v.check_out) : Date.now()) - Date.parse(v.check_in);
                  return (
                    <VisitRow
                      key={v.id}
                      label={`${fmtDay(v.check_in)} · ${fmtTime(v.check_in)}–${v.check_out ? fmtTime(v.check_out) : "now"}`}
                      duration={fmtDuration(ms)}
                      method={v.edited_by === id ? "edited by them" : v.out_method ? (METHOD_LABEL[v.out_method] ?? null) : null}
                      date={inLocal.date}
                      inTime={inLocal.time}
                      outTime={outLocal?.time ?? ""}
                      update={updateVisit.bind(null, v.id)}
                      remove={deleteVisit.bind(null, v.id)}
                    />
                  );
                })}
              </ul>
            )}
            <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
              <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Add a visit</div>
              <ActionForm action={addVisit.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <span className="label text-xs">Date</span>
                  <input type="date" name="date" defaultValue={t} required className="input py-1.5" />
                </label>
                <label className="text-xs">
                  <span className="label text-xs">In</span>
                  <input type="time" name="in" required className="input py-1.5" />
                </label>
                <label className="text-xs">
                  <span className="label text-xs">Out</span>
                  <input type="time" name="out" className="input py-1.5" />
                </label>
                <SubmitButton className="btn btn-secondary btn-sm">Add</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Profile" actions={<Link href={`/members/${id}/edit`} className="link text-sm">Edit</Link>}>
            <dl className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Detail label="Email" value={m.email} />
              </div>
              {m.role !== "mentor" && (
                <div className="col-span-2">
                  <Detail label="School subjects" value={subjectsText(m)} />
                </div>
              )}
              <div className="col-span-2">
                <Detail label="Teams" value={[m.subteam, ...m.teams].filter(Boolean).join(", ")} />
              </div>
              <Detail label="Phone" value={m.phone} />
              <Detail label="Birthday" value={m.birthday ? fmtDate(m.birthday, true) : null} />
              <Detail label="Joined" value={m.joined_year} />
              <Detail label="Shirt size" value={m.shirt_size} />
              <Detail label="Parent / guardian" value={m.parent_name} />
              <Detail label="Parent phone" value={m.parent_phone} />
              <div className="col-span-2">
                <Detail label="Allergies / medical" value={m.medical_notes} />
              </div>
            </dl>
          </Card>

          <Card title="Hours by season">
            {seasons.length === 0 ? (
              <p className="text-sm text-slate-400">
                No seasons defined.{" "}
                {captain && (
                  <Link href="/settings" className="link">
                    Add one
                  </Link>
                )}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {seasons.map(({ season, hours }) => (
                  <li key={season.id} className="flex justify-between">
                    <span>
                      {season.name} <span className="text-xs text-slate-400">{season.kind === "in_season" ? "in-season" : "off-season"}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{fmtHours(hours.ms)}h</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Login">
            <p className="mb-3 text-sm text-slate-600">
              {m.has_password ? "Has set a password." : "Hasn't set a password yet."}
              {m.invite_expires_at && new Date(m.invite_expires_at) > new Date() && ` A link is active until ${fmtDate(m.invite_expires_at.slice(0, 10))}.`}
            </p>
            <ActionForm action={makeInviteLink.bind(null, id)}>
              <SubmitButton className="btn btn-secondary btn-sm">{m.has_password ? "Create password reset link" : "Create invite link"}</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
