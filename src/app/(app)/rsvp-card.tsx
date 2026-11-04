"use client";

import { useActionState, useState } from "react";
import { respondRsvp } from "@/actions/rsvp";
import { CheckIcon, ClockIcon, XIcon } from "@/components/icons";
import { LATE_BY_OPTIONS, lateByLabel } from "@/lib/late-by";

type Response = "yes" | "late" | "no";

const OPTIONS: { value: Response; label: string; icon: typeof CheckIcon; on: string }[] = [
  { value: "yes", label: "Coming", icon: CheckIcon, on: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "late", label: "Late", icon: ClockIcon, on: "border-amber-500 bg-amber-50 text-amber-800" },
  { value: "no", label: "Can't come", icon: XIcon, on: "border-rose-500 bg-rose-50 text-rose-800" },
];

export function RsvpCard({
  meetingId,
  title,
  when,
  current,
  currentNote,
  currentLateBy,
}: {
  meetingId: number;
  title: string;
  when: string;
  current: Response | null;
  currentNote: string | null;
  currentLateBy: number | null;
}) {
  const [choice, setChoice] = useState<Response | null>(null);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof respondRsvp>>, fd: FormData) => {
    const result = await respondRsvp(prev, fd);
    if (!result?.error) setChoice(null);
    return result;
  }, undefined);
  const shown = choice ?? current;

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Will you come?</div>
          <div className="mt-0.5 font-semibold text-slate-900">{title}</div>
          <div className="text-sm text-slate-500">{when}</div>
        </div>
        {current && !choice && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Answered</span>
        )}
      </div>

      <form action={action} className="mt-3">
        <input type="hidden" name="meeting_id" value={meetingId} />
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const selected = shown === o.value;
            return (
              <button
                key={o.value}
                type={o.value === "yes" ? "submit" : "button"}
                name={o.value === "yes" ? "response" : undefined}
                value={o.value === "yes" ? "yes" : undefined}
                disabled={pending}
                onClick={() => setChoice(o.value === "yes" ? null : o.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition ${
                  selected ? o.on : "border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <Icon width={20} height={20} />
                {o.label}
              </button>
            );
          })}
        </div>

        {choice && choice !== "yes" && (
          <div className="mt-3 space-y-2">
            <input type="hidden" name="response" value={choice} />
            {choice === "late" && (
              <select
                name="late_by"
                required
                autoFocus
                defaultValue={current === "late" && currentLateBy ? String(currentLateBy) : ""}
                className="input"
                aria-label="How late will you be?"
              >
                <option value="" disabled>
                  How late will you be?
                </option>
                {LATE_BY_OPTIONS.map((min) => (
                  <option key={min} value={min}>
                    {lateByLabel(min)}
                  </option>
                ))}
              </select>
            )}
            <input
              name="note"
              required={choice === "no"}
              autoFocus={choice === "no"}
              defaultValue={current === choice ? (currentNote ?? "") : ""}
              maxLength={300}
              placeholder={choice === "late" ? "Anything to add? (optional)" : "Reason, e.g. exam tomorrow"}
              className="input"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
                Send to captains
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setChoice(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {!choice && current === "late" && currentLateBy && (
          <p className="mt-2 text-xs text-slate-500">You&apos;ll be late: {lateByLabel(currentLateBy)}</p>
        )}
        {!choice && current && current !== "yes" && currentNote && (
          <p className="mt-2 text-xs text-slate-500">Your note: {currentNote}</p>
        )}
        {state?.error && <p className="mt-2 text-sm font-medium text-rose-600">{state.error}</p>}
      </form>
    </div>
  );
}
