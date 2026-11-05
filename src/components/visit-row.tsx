"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/forms";
import { TimeInput } from "@/components/time-input";

export function VisitRow({
  label,
  duration,
  method,
  date,
  inTime,
  outTime,
  update,
  remove,
}: {
  label: string;
  duration: string;
  method: string | null;
  date: string;
  inTime: string;
  outTime: string;
  update: (state: FormState, fd: FormData) => Promise<FormState>;
  remove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const result = await update(prev, fd);
    if (!result?.error) setEditing(false);
    return result;
  }, undefined);

  if (!editing) {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
        <span className="flex-1">
          {label}
          {method && <span className="ml-1.5 text-xs text-slate-500">({method})</span>}
        </span>
        <span className="font-medium tabular-nums">{duration}</span>
        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setEditing(true)}>
          Edit
        </button>
      </li>
    );
  }

  return (
    <li className="bg-slate-50 px-4 py-3 sm:px-5">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="label text-xs">Date</span>
          <input type="date" name="date" defaultValue={date} required className="input py-1.5" />
        </label>
        <label className="text-xs">
          <span className="label text-xs">In</span>
          <TimeInput name="in" defaultValue={inTime} required step={1} />
        </label>
        <label className="text-xs">
          <span className="label text-xs">Out</span>
          <TimeInput name="out" defaultValue={outTime} step={1} />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          Save
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="submit"
          formAction={remove}
          className="btn btn-sm ml-auto text-rose-600 hover:bg-rose-50"
          onClick={(e) => {
            if (!confirm("Delete this visit?")) e.preventDefault();
          }}
        >
          Delete
        </button>
      </form>
      {state?.error && <p className="mt-2 text-sm text-rose-600">{state.error}</p>}
    </li>
  );
}
