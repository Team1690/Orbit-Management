import type { Audience } from "@/lib/audience";
import { EXTRA_TEAMS, SUBTEAMS } from "@/lib/members";
import { CHIP_CLASS as chip } from "./ui";

/** "Who needs to come": teams and/or individual students; nothing ticked means the whole team. */
export function AudiencePicker({
  students,
  selected,
  className = "",
}: {
  students: { id: number; name: string }[];
  selected: Audience | null;
  className?: string;
}) {
  const people = selected?.members.length ?? 0;
  return (
    <fieldset className={className}>
      <legend className="label">Who needs to come</legend>
      <p className="mb-2 text-xs text-slate-500">
        Leave everything unticked for the whole team. Only the people picked get the RSVP and count for attendance.
      </p>
      <div className="flex flex-wrap gap-2">
        {[...SUBTEAMS, ...EXTRA_TEAMS].map((team) => (
          <label key={team} className={chip}>
            <input type="checkbox" name="aud_team" value={team} defaultChecked={selected?.teams.includes(team)} className="size-4 accent-brand-600" />
            {team}
          </label>
        ))}
      </div>
      <details className="mt-2" open={people > 0}>
        <summary className="cursor-pointer text-sm font-medium text-brand-700">Specific people{people ? ` (${people})` : ""}</summary>
        <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
          {students.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" name="aud_member" value={s.id} defaultChecked={selected?.members.includes(s.id)} className="size-4 accent-brand-600" />
              {s.name}
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}
