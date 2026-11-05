import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteMeeting, setAttendance, setCancelled, setMemberRsvp, updateMeeting } from "@/actions/meetings";
import { AudiencePicker } from "@/components/audience-picker";
import { ActionForm, AutoRefresh, AutoSubmitSelect, ConfirmButton, Reveal, SubmitButton } from "@/components/client";
import { MonitorIcon } from "@/components/icons";
import { AttendanceBadge, Badge, Banner, Card, Empty, Field, PageHeader } from "@/components/ui";
import { computeAttendance, type AttendanceEntry } from "@/lib/attendance";
import { audienceLabel, parseAudience } from "@/lib/audience";
import { requireStaff } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtTime, minutesLate } from "@/lib/format";
import { LATE_BY_OPTIONS, lateByLabel } from "@/lib/late-by";
import { getMeeting, meetingWindow } from "@/lib/meetings";
import { listMembers } from "@/lib/members";
import { getSettings } from "@/lib/settings";
import { TimeInput } from "@/components/time-input";
import { VolunteerFields } from "@/components/volunteer-fields";
import { openSpots, slotsFor, volunteersFor } from "@/lib/volunteers";

export const metadata: Metadata = { title: "Meeting" };

const ORDER: Record<AttendanceEntry["status"], number> = { missing: 0, absent: 1, late: 2, upcoming: 3, not_required: 4, present: 5 };

/** The RSVP dropdown's value for a member's answer. */
function rsvpValue(e: AttendanceEntry) {
  if (!e.rsvp) return "none";
  return e.rsvp.response === "late" ? `late:${e.rsvp.late_by_min ?? ""}` : e.rsvp.response;
}

export default async function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  await requireStaff();
  const id = Number((await params).id);
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const { start, end } = meetingWindow(meeting);
  const now = new Date();
  const live = now >= start && now < end;
  const started = now >= start;
  const { late_grace_min } = await getSettings();
  const members = new Map((await listMembers({ includeInactive: true })).map((m) => [m.id, m]));
  const rows = [...((await computeAttendance([meeting])).get(id) ?? new Map<number, AttendanceEntry>())].sort(
    ([a, ea], [b, eb]) => ORDER[ea.status] - ORDER[eb.status] || members.get(a)!.name.localeCompare(members.get(b)!.name),
  );

  const slots = (await slotsFor([id])).get(id) ?? [];
  const volunteers = (await volunteersFor([id])).get(id) ?? [];
  const open = await openSpots(id, slots, volunteers);
  const volunteerIds = new Set(volunteers.map((v) => v.user_id));
  const oneOff = meeting.schedule_id === null;

  const count = (pred: (e: AttendanceEntry) => boolean) => rows.filter(([, e]) => pred(e)).length;
  const chips = started
    ? [
        { label: "Present", n: count((e) => e.status === "present"), tone: "green" as const },
        { label: "Late", n: count((e) => e.status === "late"), tone: "yellow" as const },
        { label: live ? "Not here yet" : "Absent", n: count((e) => (e.status === "absent" || e.status === "missing") && !e.notice), tone: "red" as const },
        { label: "Gave notice", n: count((e) => (e.status === "absent" || e.status === "missing") && e.notice), tone: "purple" as const },
      ]
    : [
        { label: "Coming", n: count((e) => e.rsvp?.response === "yes"), tone: "green" as const },
        { label: "Late", n: count((e) => e.rsvp?.response === "late"), tone: "yellow" as const },
        { label: "Can't come", n: count((e) => e.rsvp?.response === "no"), tone: "red" as const },
        { label: "No answer", n: count((e) => !e.rsvp), tone: "gray" as const },
      ];

  return (
    <div>
      {live && <AutoRefresh seconds={15} />}
      <PageHeader
        title={meeting.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {fmtDate(meeting.date, true)} · {fmtTime(start)}–{fmtTime(end)}
            {meeting.cancelled ? <Badge tone="red">Cancelled</Badge> : null}
            {!meeting.mandatory ? <Badge>Optional</Badge> : null}
            {!meeting.rsvp ? <Badge>No RSVP</Badge> : null}
            {meeting.open_to_all ? <Badge tone="green">Open to everyone</Badge> : null}
            <Badge tone="blue">For: {audienceLabel(parseAudience(meeting.audience)) ?? "whole team"}</Badge>
            {meeting.reminder_hours ? (
              <Badge>
                Reminder {meeting.reminder_hours}h before{meeting.reminder_sent_at ? " · sent" : ""}
              </Badge>
            ) : null}
            {live && <Badge tone="green">Happening now</Badge>}
          </span>
        }
        actions={
          <>
            {!started || live ? (
              <a href="/qr" target="_blank" className="btn btn-primary">
                <MonitorIcon /> Show check-in code
              </a>
            ) : null}
            <form action={setCancelled}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="cancelled" value={meeting.cancelled ? "0" : "1"} />
              <SubmitButton className="btn btn-secondary">{meeting.cancelled ? "Restore meeting" : "Cancel meeting"}</SubmitButton>
            </form>
          </>
        }
      />

      {meeting.notes && <Banner tone="blue">{meeting.notes}</Banner>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {chips.map((c) => (
          <div key={c.label} className="card card-pad">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{c.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{c.n}</div>
          </div>
        ))}
      </div>

      {slots.length > 0 && (
        <Card
          title="Volunteers"
          className="mb-5"
          actions={
            <span className="text-xs text-slate-500">
              {meeting.volunteer_ask_at ? `Asked ${fmtDateTime(meeting.volunteer_ask_at)}` : "Not asked yet"}
              {meeting.volunteer_reask_at
                ? ` · again ${fmtDateTime(meeting.volunteer_reask_at)}`
                : meeting.volunteer_reask_hours
                  ? ` · asks again ${meeting.volunteer_reask_hours}h later if spots are open`
                  : ""}
            </span>
          }
        >
          <ul className="space-y-3 text-sm">
            {slots.map((sl) => {
              const names = volunteers.filter((v) => v.team === sl.team).map((v) => members.get(v.user_id)?.name ?? "Former member");
              return (
                <li key={sl.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{sl.team ?? "Anyone on the team"}</span>
                    <Badge tone={open.get(sl.id) ? "yellow" : "green"}>
                      {sl.wanted - (open.get(sl.id) ?? 0)} of {sl.wanted}
                      {open.get(sl.id) ? ` · ${open.get(sl.id)} open` : " · full"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-slate-600">{names.length ? names.join(", ") : <span className="text-slate-400">Nobody yet</span>}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card
        title={`Attendance sheet (${rows.length})`}
        actions={<span className="text-xs text-slate-500">Late = checked in more than {late_grace_min} min after start</span>}
        pad={false}
      >
        {rows.length === 0 ? (
          <Empty>{slots.length ? "Nobody yet. Volunteers show up here once they sign up." : "No active members."}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>RSVP</th>
                  <th>Checked in</th>
                  <th>Status</th>
                  <th>Captain override</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([userId, e]) => {
                  const m = members.get(userId)!;
                  return (
                    <tr key={userId}>
                      <td>
                        <Link href={`/members/${userId}`} className="font-medium hover:underline">
                          {m.name}
                        </Link>
                        {volunteerIds.has(userId) && (
                          <span className="ml-1.5">
                            <Badge tone="purple">Volunteer</Badge>
                          </span>
                        )}
                        {m.subteam && <div className="text-xs text-slate-500">{m.subteam}</div>}
                      </td>
                      <td>
                        {meeting.rsvp ? (
                          <form action={setMemberRsvp}>
                            <input type="hidden" name="meeting_id" value={id} />
                            <input type="hidden" name="user_id" value={userId} />
                            <AutoSubmitSelect name="answer" defaultValue={rsvpValue(e)} className="input w-auto py-1 text-xs" key={rsvpValue(e)} aria-label="RSVP">
                              <option value="none">No answer</option>
                              <option value="yes">Coming</option>
                              {e.rsvp?.response === "late" && !e.rsvp.late_by_min && <option value="late:">Late</option>}
                              {LATE_BY_OPTIONS.map((min) => (
                                <option key={min} value={`late:${min}`}>
                                  Late · {lateByLabel(min)}
                                </option>
                              ))}
                              <option value="no">Can&apos;t come</option>
                            </AutoSubmitSelect>
                          </form>
                        ) : (
                          "—"
                        )}
                        {e.rsvp?.note && <div className="mt-0.5 max-w-56 text-xs text-slate-500">&ldquo;{e.rsvp.note}&rdquo;</div>}
                        {e.rsvp && (
                          <div className="text-[11px] text-slate-400">
                            {fmtDateTime(e.rsvp.responded_at)}
                            {e.rsvp.updated_by && " · set by a captain"}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {e.firstIn ? fmtTime(e.firstIn) : <span className="text-slate-400">—</span>}
                        {e.firstIn && e.status === "late" && <span className="ml-1.5 text-xs font-semibold text-amber-700">+{minutesLate(e.firstIn, start)} min</span>}
                      </td>
                      <td>
                        <AttendanceBadge entry={e} />
                      </td>
                      <td>
                        <form action={setAttendance} className="flex items-center gap-2">
                          <input type="hidden" name="meeting_id" value={id} />
                          <input type="hidden" name="user_id" value={userId} />
                          <AutoSubmitSelect name="status" defaultValue={e.overridden ? e.status : "auto"} className="input w-auto py-1 text-xs" key={`${e.overridden}-${e.status}`}>
                            <option value="auto">Automatic</option>
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="absent">Absent</option>
                          </AutoSubmitSelect>
                          {e.overridden && e.status !== "present" && (
                            <label className="flex items-center gap-1 text-xs whitespace-nowrap text-slate-600">
                              <input
                                type="checkbox"
                                name="notice"
                                defaultChecked={e.notice}
                                className="size-3.5"
                                key={`${e.notice}`}
                              />
                              Notified
                            </label>
                          )}
                          {e.overridden && e.status !== "present" && <SubmitButton className="btn btn-ghost btn-sm">Save</SubmitButton>}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 flex flex-wrap items-start gap-3">
        <Reveal label="Edit meeting details">
          <Card title="Edit meeting" className="w-full max-w-xl">
            <ActionForm action={updateMeeting.bind(null, id)} className="grid grid-cols-2 gap-3">
              <Field label="Title" className="col-span-2">
                <input name="title" defaultValue={meeting.title} required className="input" />
              </Field>
              <Field label="Date" className="col-span-2">
                <input name="date" type="date" defaultValue={meeting.date} required className="input" />
              </Field>
              <Field label="Start">
                <TimeInput name="start_time" defaultValue={meeting.start_time} required />
              </Field>
              <Field label="End">
                <TimeInput name="end_time" defaultValue={meeting.end_time} required />
              </Field>
              <Field label="Notes for this meeting" className="col-span-2">
                <textarea name="notes" rows={2} defaultValue={meeting.notes ?? ""} className="input" />
              </Field>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="mandatory" defaultChecked={!!meeting.mandatory} className="size-4" /> Attendance required
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="rsvp" defaultChecked={!!meeting.rsvp} className="size-4" /> Ask members to RSVP
              </label>
              <label className="col-span-2 flex items-start gap-2 text-sm">
                <input type="checkbox" name="open_to_all" defaultChecked={!!meeting.open_to_all} className="mt-0.5 size-4" />
                <span>
                  Open meeting
                  <span className="block text-xs text-slate-500">Everyone sees it on their home screen and gets an FYI notification, quiet for those not invited. Unticked, only the people invited see it.</span>
                </span>
              </label>
              <Field label="Reminder (hours before)" className="col-span-2" hint="Notifies everyone invited, except those who said they can't come. Leave empty for no reminder.">
                <input name="reminder_hours" type="number" min={1} max={168} placeholder="e.g. 2" defaultValue={meeting.reminder_hours ?? ""} className="input" />
              </Field>
              <AudiencePicker
                students={[...members.values()].filter((s) => s.active && s.role !== "mentor")}
                selected={parseAudience(meeting.audience)}
                allowNone={oneOff}
                className="col-span-2"
              />
              {oneOff && <VolunteerFields slots={slots} reaskHours={slots.length ? meeting.volunteer_reask_hours : 24} className="col-span-2" />}
              <div className="col-span-2">
                <SubmitButton>Save</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </Reveal>
        <form action={deleteMeeting}>
          <input type="hidden" name="id" value={id} />
          <ConfirmButton message="Delete this meeting and all its RSVPs and overrides? Check-ins are kept." className="btn btn-sm text-rose-600 hover:bg-rose-50">
            Delete meeting
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
