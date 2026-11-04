import type { Metadata } from "next";
import {
  addMentorSlot,
  addMentorVisit,
  removeMentorChange,
  removeMentorSlot,
  skipMentorSlot,
  updateMentorSlot,
  updateMentorVisit,
} from "@/actions/mentors";
import { ActionForm, ConfirmButton, Reveal, SubmitButton } from "@/components/client";
import { Avatar, Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtTime, relativeDay } from "@/lib/format";
import { WEEKDAY_NAMES } from "@/lib/meetings";
import { listMentors, mentorPlan, mentorSlots, type PlanEntry } from "@/lib/mentors";
import { today } from "@/lib/periods";
import { presentNow } from "@/lib/visits";

export const metadata: Metadata = { title: "Mentors" };

function EntryActions({ entry, date }: { entry: PlanEntry; date: string }) {
  if (entry.kind === "extra") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Reveal label="Edit" className="text-xs font-medium text-brand-700 hover:underline">
          <ActionForm action={updateMentorVisit.bind(null, entry.changeId!)} className="flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-2">
            <input name="date" type="date" defaultValue={date} required className="input w-auto py-1 text-xs" aria-label="Date" />
            <input name="start_time" type="time" defaultValue={entry.start} required className="input w-auto py-1 text-xs" aria-label="Arrive" />
            <input name="end_time" type="time" defaultValue={entry.end} required className="input w-auto py-1 text-xs" aria-label="Leave" />
            <input name="note" defaultValue={entry.note ?? ""} maxLength={200} placeholder="Note" className="input w-36 py-1 text-xs" aria-label="Note" />
            <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
          </ActionForm>
        </Reveal>
        <form action={removeMentorChange}>
          <input type="hidden" name="id" value={entry.changeId!} />
          <ConfirmButton message="Remove this visit?" className="text-xs font-medium text-rose-600 hover:underline">
            Remove
          </ConfirmButton>
        </form>
      </div>
    );
  }
  if (entry.skipped) {
    return (
      <form action={removeMentorChange}>
        <input type="hidden" name="id" value={entry.changeId!} />
        <SubmitButton className="text-xs font-medium text-brand-700 hover:underline">I can come after all</SubmitButton>
      </form>
    );
  }
  return (
    <form action={skipMentorSlot}>
      <input type="hidden" name="slot_id" value={entry.slotId!} />
      <input type="hidden" name="date" value={date} />
      <SubmitButton className="text-xs font-medium text-rose-600 hover:underline">Can&apos;t come</SubmitButton>
    </form>
  );
}

export default async function MentorsPage() {
  const me = await requireUser();
  const isMentor = me.role === "mentor";
  const t = today();
  const plan = (await mentorPlan(t, 14)).filter((d) => d.entries.length > 0);
  const mentors = await listMentors();
  const slots = await mentorSlots();
  const here = (await presentNow()).filter((p) => p.role === "mentor");
  const mySlots = slots.filter((s) => s.user_id === me.id);

  return (
    <div>
      <PageHeader title="Mentors" subtitle="When our mentors are coming in, so you know who to ask for help." />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {here.length > 0 && (
            <Card title={`At school now (${here.length})`}>
              <ul className="flex flex-wrap gap-3">
                {here.map((p) => (
                  <li key={p.user_id} className="flex items-center gap-2 rounded-xl bg-emerald-50 py-1.5 pr-3 pl-1.5">
                    <Avatar name={p.name} size={30} />
                    <span className="text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-emerald-700">since {fmtTime(p.check_in)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Next two weeks" pad={false}>
            {plan.length === 0 ? (
              <Empty>{isMentor ? "Nothing planned yet. Add your weekly times on this page." : "No mentor visits planned in the next two weeks."}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {plan.map((day) => (
                  <li key={day.date} className="px-4 py-3 sm:px-5">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-brand-600 uppercase">{relativeDay(day.date)}</div>
                    <ul className="space-y-2">
                      {day.entries.map((e) => (
                        <li key={`${e.kind}-${e.slotId ?? e.changeId}`} className={`flex flex-wrap items-center gap-3 ${e.skipped ? "opacity-60" : ""}`}>
                          <Avatar name={e.name} size={34} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-sm">
                              <span className={`font-medium ${e.skipped ? "line-through" : ""}`}>{e.name}</span>
                              {e.subteam && <span className="text-xs text-slate-500">{e.subteam}</span>}
                              {e.kind === "extra" && <Badge tone="blue">Extra visit</Badge>}
                              {e.skipped && <Badge tone="red">Can&apos;t come</Badge>}
                            </div>
                            <div className="text-xs text-slate-500">
                              <span className={`font-medium text-slate-700 tabular-nums ${e.skipped ? "line-through" : ""}`}>
                                {e.start}–{e.end}
                              </span>
                              {e.note && ` · ${e.note}`}
                            </div>
                          </div>
                          {e.mentorId === me.id && <EntryActions entry={e} date={day.date} />}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {isMentor && (
            <>
              <Card title="My weekly times">
                {mySlots.length === 0 ? (
                  <p className="mb-4 text-sm text-slate-500">Add the times you usually come in. Everyone on the team will see them.</p>
                ) : (
                  <ul className="mb-4 divide-y divide-slate-100">
                    {mySlots.map((s) => (
                      <li key={s.id} className="py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <span className="font-medium">{WEEKDAY_NAMES[s.weekday]}</span> {s.start_time}–{s.end_time}
                            {s.note && <span className="block text-xs text-slate-500">{s.note}</span>}
                          </span>
                          <form action={removeMentorSlot}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmButton message="Remove this weekly time?" className="text-xs text-rose-600 hover:underline">
                              Remove
                            </ConfirmButton>
                          </form>
                        </div>
                        <Reveal label="Edit" className="mt-1 text-xs font-medium text-brand-700 hover:underline">
                          <ActionForm action={updateMentorSlot.bind(null, s.id)} className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                            <select name="weekday" defaultValue={s.weekday} className="input col-span-2" aria-label="Day">
                              {WEEKDAY_NAMES.map((d, i) => (
                                <option key={d} value={i}>
                                  {d}
                                </option>
                              ))}
                            </select>
                            <input name="start_time" type="time" defaultValue={s.start_time} required className="input" aria-label="Arrive" />
                            <input name="end_time" type="time" defaultValue={s.end_time} required className="input" aria-label="Leave" />
                            <input name="note" defaultValue={s.note ?? ""} maxLength={200} placeholder="Note (optional)" className="input col-span-2" aria-label="Note" />
                            <div className="col-span-2">
                              <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                            </div>
                          </ActionForm>
                        </Reveal>
                      </li>
                    ))}
                  </ul>
                )}
                <ActionForm action={addMentorSlot} className="grid grid-cols-2 gap-3">
                  <Field label="Day" className="col-span-2">
                    <select name="weekday" className="input" defaultValue="0">
                      {WEEKDAY_NAMES.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Arrive">
                    <input name="start_time" type="time" defaultValue="17:00" required className="input" />
                  </Field>
                  <Field label="Leave">
                    <input name="end_time" type="time" defaultValue="19:00" required className="input" />
                  </Field>
                  <Field label="Note (optional)" className="col-span-2">
                    <input name="note" maxLength={200} placeholder="e.g. Helping with the swerve modules" className="input" />
                  </Field>
                  <div className="col-span-2">
                    <SubmitButton className="btn btn-secondary w-full">Add weekly time</SubmitButton>
                  </div>
                </ActionForm>
              </Card>

              <Card title="Extra visit">
                <ActionForm action={addMentorVisit} className="grid grid-cols-2 gap-3">
                  <Field label="Date" className="col-span-2">
                    <input name="date" type="date" defaultValue={t} min={t} required className="input" />
                  </Field>
                  <Field label="Arrive">
                    <input name="start_time" type="time" defaultValue="17:00" required className="input" />
                  </Field>
                  <Field label="Leave">
                    <input name="end_time" type="time" defaultValue="19:00" required className="input" />
                  </Field>
                  <Field label="Note (optional)" className="col-span-2">
                    <input name="note" maxLength={200} className="input" />
                  </Field>
                  <div className="col-span-2">
                    <SubmitButton className="btn btn-secondary w-full">Add visit</SubmitButton>
                  </div>
                </ActionForm>
              </Card>
            </>
          )}

          <Card title="Regular weekly times">
            {mentors.length === 0 ? (
              <p className="text-sm text-slate-500">No mentors yet.</p>
            ) : (
              <ul className="space-y-3">
                {mentors.map((m) => {
                  const own = slots.filter((s) => s.user_id === m.id);
                  return (
                    <li key={m.id} className="flex gap-3">
                      <Avatar name={m.name} size={30} />
                      <div className="min-w-0 text-sm">
                        <div className="font-medium">{m.name}</div>
                        {own.length === 0 ? (
                          <div className="text-xs text-slate-400">No regular times</div>
                        ) : (
                          own.map((s) => (
                            <div key={s.id} className="text-xs text-slate-600">
                              {WEEKDAY_NAMES[s.weekday]} {s.start_time}–{s.end_time}
                            </div>
                          ))
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
