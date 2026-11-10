import type { Metadata } from "next";
import Link from "next/link";
import { addScheduleRule, createMeeting, deleteScheduleRule, setScheduleAudience } from "@/actions/meetings";
import { AudiencePicker } from "@/components/audience-picker";
import { ActionForm, ConfirmButton, Reveal, SubmitButton } from "@/components/client";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { computeAttendance } from "@/lib/attendance";
import { audienceLabel, inAudience, parseAudience } from "@/lib/audience";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtTime, relativeDay } from "@/lib/format";
import { APPLIES_LABEL, WEEKDAY_NAMES, listSchedule, meetingWindow, meetingsBetween, rsvpsFor, seasonKindOn, type Meeting } from "@/lib/meetings";
import { listStudents } from "@/lib/members";
import { today } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { runTick } from "@/lib/tick";
import { addDays } from "@/lib/timeutil";
import { TimeInput } from "@/components/time-input";
import { VolunteerFields } from "@/components/volunteer-fields";
import { slotsFor, volunteersFor } from "@/lib/volunteers";

export const metadata: Metadata = { title: "Meetings" };

function MeetingFlags({ m }: { m: Meeting }) {
  const forWho = audienceLabel(parseAudience(m.audience));
  return (
    <>
      {m.cancelled ? <Badge tone="red">Cancelled</Badge> : null}
      {!m.mandatory ? <Badge>Optional</Badge> : null}
      {!m.rsvp ? <Badge>No RSVP</Badge> : null}
      {m.open_to_all ? <Badge tone="green">Open</Badge> : null}
      {m.no_checkin ? <Badge tone="purple">No check-in</Badge> : null}
      {forWho ? <Badge tone="blue">For: {forWho}</Badge> : null}
    </>
  );
}

export default async function MeetingsPage() {
  await requireStaff();
  await runTick();
  const { schedule_days_ahead } = await getSettings();
  const t = today();
  const now = new Date();
  const students = await listStudents();
  const upcoming = (await meetingsBetween(t, addDays(t, schedule_days_ahead))).filter((m) => meetingWindow(m).end > now);
  const slots = await slotsFor(upcoming.map((m) => m.id));
  const volunteers = await volunteersFor(upcoming.map((m) => m.id));
  /** The students a meeting is for: its audience plus its volunteers. */
  const expected = (m: Meeting) => {
    const audience = parseAudience(m.audience);
    const extra = new Set((volunteers.get(m.id) ?? []).map((v) => v.user_id));
    return new Set(students.filter((s) => extra.has(s.id) || inAudience(audience, s)).map((s) => s.id));
  };

  const invited = new Map(upcoming.map((m) => [m.id, expected(m)]));
  const counts = new Map<number, { yes: number; late: number; no: number }>();
  for (const r of await rsvpsFor(upcoming.map((m) => m.id))) {
    if (!invited.get(r.meeting_id)?.has(r.user_id)) continue;
    const c = counts.get(r.meeting_id) ?? { yes: 0, late: 0, no: 0 };
    c[r.response] += 1;
    counts.set(r.meeting_id, c);
  }

  const past = (await meetingsBetween(addDays(t, -45), t))
    .filter((m) => meetingWindow(m).end <= now)
    .reverse();
  const pastAttendance = await computeAttendance(past.filter((m) => !m.cancelled));
  const schedule = await listSchedule();
  const seasonNow = await seasonKindOn(t);

  return (
    <div>
      <PageHeader title="Meetings" subtitle="Regular meetings are created automatically from the weekly schedule." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Upcoming" pad={false}>
            {upcoming.length === 0 ? (
              <Empty>No upcoming meetings. Add a weekly schedule or a one-off meeting.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((m) => {
                  const { start, end } = meetingWindow(m);
                  const c = counts.get(m.id) ?? { yes: 0, late: 0, no: 0 };
                  const answered = c.yes + c.late + c.no;
                  return (
                    <li key={m.id}>
                      <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                        <div className="w-16 shrink-0 text-center">
                          <div className="text-xs font-semibold text-brand-600 uppercase">{relativeDay(m.date).split(" ")[0]}</div>
                          <div className="text-sm font-bold">{fmtDate(m.date).split(" ").slice(1).join(" ")}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`flex flex-wrap items-center gap-1.5 text-sm font-medium ${m.cancelled ? "text-slate-400 line-through" : ""}`}>
                            {m.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            {fmtTime(start)}–{fmtTime(end)} <MeetingFlags m={m} />
                            {slots.has(m.id) && (
                              <Badge tone="purple">
                                Volunteers {volunteers.get(m.id)?.length ?? 0}/{slots.get(m.id)!.reduce((n, sl) => n + sl.wanted, 0)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {m.rsvp && !m.cancelled ? (
                          <div className="text-right text-xs tabular-nums">
                            <div>
                              <span className="font-semibold text-emerald-600">{c.yes}</span> ·{" "}
                              <span className="font-semibold text-amber-600">{c.late}</span> ·{" "}
                              <span className="font-semibold text-rose-600">{c.no}</span>
                            </div>
                            <div className="text-slate-400">{(invited.get(m.id)?.size ?? 0) - answered} no answer</div>
                          </div>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Past 45 days" pad={false}>
            {past.length === 0 ? (
              <Empty>No past meetings yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {past.map((m) => {
                  const rows = [...(pastAttendance.get(m.id)?.values() ?? [])];
                  const came = rows.filter((e) => e.status === "present" || e.status === "late").length;
                  const late = rows.filter((e) => e.status === "late").length;
                  const absent = rows.filter((e) => e.status === "absent" && !e.notice).length;
                  return (
                    <li key={m.id}>
                      <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-medium ${m.cancelled ? "text-slate-400 line-through" : ""}`}>
                            {m.title} · {fmtDate(m.date)}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500">
                            {m.start_time}–{m.end_time} <MeetingFlags m={m} />
                          </div>
                        </div>
                        {!m.cancelled && (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Badge tone="green">
                              {came}/{rows.length} came
                            </Badge>
                            {late > 0 && <Badge tone="yellow">{late} late</Badge>}
                            {absent > 0 && <Badge tone="red">{absent} no notice</Badge>}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Weekly schedule"
            actions={<Badge tone={seasonNow === "in_season" ? "blue" : "gray"}>Now: {seasonNow === "in_season" ? "in-season" : "off-season"}</Badge>}
          >
            {schedule.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">No regular meetings yet. Add your weekly slots and the app will create each meeting and ask for RSVPs.</p>
            ) : (
              <div className="mb-4 space-y-4">
                {(["all", "in_season", "off_season"] as const).map((applies) => {
                  const rules = schedule.filter((r) => r.applies === applies);
                  if (rules.length === 0) return null;
                  const active = applies === "all" || applies === seasonNow;
                  return (
                    <div key={applies}>
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        {APPLIES_LABEL[applies]}
                        {!active && <span className="font-normal tracking-normal normal-case">(not running now)</span>}
                      </div>
                      <ul className={`divide-y divide-slate-100 ${active ? "" : "opacity-60"}`}>
                        {rules.map((r) => (
                          <li key={r.id} className="py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                <span className="font-medium">{WEEKDAY_NAMES[r.weekday]}</span> {r.start_time}–{r.end_time}
                                <span className="block text-xs text-slate-500">
                                  {r.title} · {audienceLabel(parseAudience(r.audience)) ?? "Whole team"}
                                </span>
                              </span>
                              <form action={deleteScheduleRule}>
                                <input type="hidden" name="id" value={r.id} />
                                <ConfirmButton
                                  message="Remove this weekly slot? Future meetings from it that nobody has answered yet will be deleted. Past meetings stay."
                                  className="text-xs text-rose-600 hover:underline"
                                >
                                  Remove
                                </ConfirmButton>
                              </form>
                            </div>
                            <Reveal label="Change who comes" className="mt-1 text-xs font-medium text-brand-700 hover:underline">
                              <ActionForm action={setScheduleAudience.bind(null, r.id)} className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
                                <AudiencePicker students={students} selected={parseAudience(r.audience)} />
                                <p className="text-xs text-slate-500">Also applies to this slot&apos;s meetings from today on.</p>
                                <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                              </ActionForm>
                            </Reveal>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            <ActionForm action={addScheduleRule} className="grid grid-cols-2 gap-3">
              <Field
                label="When"
                className="col-span-2"
                hint={
                  <>
                    In-season dates come from <Link href="/settings" className="link">Settings → Seasons</Link>. Any date outside an in-season period
                    counts as off-season.
                  </>
                }
              >
                <select name="applies" className="input" defaultValue="all">
                  <option value="all">Every week</option>
                  <option value="in_season">In-season only</option>
                  <option value="off_season">Off-season only</option>
                </select>
              </Field>
              <Field label="Day" className="col-span-2">
                <select name="weekday" className="input" defaultValue="0">
                  {WEEKDAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start">
                <TimeInput name="start_time" defaultValue="16:00" required />
              </Field>
              <Field label="End">
                <TimeInput name="end_time" defaultValue="20:00" required />
              </Field>
              <Field label="Title" className="col-span-2">
                <input name="title" defaultValue="Team meeting" className="input" />
              </Field>
              <Field label="Reminder (hours before)" className="col-span-2" hint="Notifies everyone invited, except those who said they can't come. Leave empty for no reminder.">
                <input name="reminder_hours" type="number" min={1} max={168} placeholder="e.g. 2" className="input" />
              </Field>
              <AudiencePicker students={students} selected={null} className="col-span-2" />
              <div className="col-span-2">
                <SubmitButton className="btn btn-secondary w-full">Add weekly slot</SubmitButton>
              </div>
            </ActionForm>
          </Card>

          <Card title="One-off meeting">
            <ActionForm action={createMeeting} className="grid grid-cols-2 gap-3">
              <Field label="Title" className="col-span-2">
                <input name="title" placeholder="e.g. Saturday build day" required className="input" />
              </Field>
              <Field label="Date" className="col-span-2">
                <input name="date" type="date" defaultValue={t} required className="input" />
              </Field>
              <Field label="Start">
                <TimeInput name="start_time" defaultValue="10:00" required />
              </Field>
              <Field label="End">
                <TimeInput name="end_time" defaultValue="16:00" required />
              </Field>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="mandatory" defaultChecked className="size-4" /> Attendance required
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="rsvp" defaultChecked className="size-4" /> Ask members to RSVP
              </label>
              <label className="col-span-2 flex items-start gap-2 text-sm">
                <input type="checkbox" name="no_checkin"  className="mt-0.5 size-4" />
                <span>
                  No check-in needed
                  <span className="block text-xs text-slate-500">
                    Everyone who answers Coming or Late counts as present and gets the meeting's hours; nobody scans in.
                  </span>
                </span>
              </label>
              <label className="col-span-2 flex items-start gap-2 text-sm">
                <input type="checkbox" name="open_to_all" className="mt-0.5 size-4" />
                <span>
                  Open meeting
                  <span className="block text-xs text-slate-500">Everyone sees it on their home screen and gets an FYI notification, quiet for those not invited. Unticked, only the people invited see it.</span>
                </span>
              </label>
              <Field label="Reminder (hours before)" className="col-span-2" hint="Notifies everyone invited, except those who said they can't come. Leave empty for no reminder.">
                <input name="reminder_hours" type="number" min={1} max={168} placeholder="e.g. 2" className="input" />
              </Field>
              <AudiencePicker students={students} selected={null} allowNone className="col-span-2" />
              <VolunteerFields className="col-span-2" />
              <div className="col-span-2">
                <SubmitButton className="btn btn-primary w-full">Create meeting</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
