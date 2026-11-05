import { EXTRA_TEAMS, SUBTEAMS } from "@/lib/members";

// The "Ask for volunteers" part of a one-off meeting's form: rows of "how many, from which team"
// (read by readVolunteerRequest in actions/meetings.ts). Empty rows are ignored.

export function VolunteerFields({
  slots = [],
  reaskHours = 24,
  className = "",
}: {
  slots?: { team: string | null; wanted: number }[];
  reaskHours?: number | null;
  className?: string;
}) {
  const rows = [...slots, ...Array.from({ length: Math.max(1, 3 - slots.length) }, () => ({ team: null, wanted: 0 }))];
  return (
    <details className={className} open={slots.length > 0}>
      <summary className="cursor-pointer text-sm font-medium text-brand-700">Ask for volunteers{slots.length ? ` (${slots.length})` : ""}</summary>
      <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="text-xs text-slate-500">
          Students who aren&apos;t already expected see the request on their home screen and get a notification. They can only say yes;
          volunteers are then expected like everyone invited and get the meeting&apos;s reminder.
        </p>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              name="vol_count"
              type="number"
              min={1}
              max={100}
              defaultValue={r.wanted || ""}
              placeholder="0"
              className="input w-20"
              aria-label={`Row ${i + 1}: how many`}
            />
            <span className="shrink-0 text-sm text-slate-500">from</span>
            <select name="vol_team" defaultValue={r.team ?? ""} className="input" aria-label={`Row ${i + 1}: from which team`}>
              <option value="">Anyone on the team</option>
              <optgroup label="Subteams">
                {SUBTEAMS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </optgroup>
              <optgroup label="Teams">
                {EXTRA_TEAMS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </optgroup>
            </select>
          </div>
        ))}
        <label className="block">
          <span className="label">Ask again after (hours)</span>
          <input name="vol_reask_hours" type="number" min={1} max={336} defaultValue={reaskHours ?? ""} className="input w-28" />
          <span className="mt-1 block text-xs text-slate-500">
            If spots are still open this long after the first ask, everyone who can still volunteer is asked again. Leave empty to ask once.
          </span>
        </label>
      </div>
    </details>
  );
}
