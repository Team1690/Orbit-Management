import { Field } from "./ui";
import { EXTRA_TEAMS, SCHOOL_SUBJECTS, SUBTEAMS } from "@/lib/members";

export function SubteamSelect({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <Field label="Subteam">
      <select name="subteam" defaultValue={defaultValue ?? ""} className="input">
        <option value="">—</option>
        {SUBTEAMS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </Field>
  );
}

export function TeamCheckboxes({ selected = [], className = "" }: { selected?: string[]; className?: string }) {
  return (
    <fieldset className={className}>
      <legend className="label">Also on these teams</legend>
      <div className="flex flex-wrap gap-2">
        {EXTRA_TEAMS.map((team) => (
          <label
            key={team}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
          >
            <input type="checkbox" name="teams" value={team} defaultChecked={selected.includes(team)} className="size-4 accent-brand-600" />
            {team}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubjectInputs({ subject1, subject2, className = "" }: { subject1?: string | null; subject2?: string | null; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      <Field label="School subject 1" hint="The subjects (majors) chosen at school.">
        <input name="subject_1" list="school-subjects" defaultValue={subject1 ?? ""} className="input" placeholder="e.g. Physics" />
      </Field>
      <Field label="School subject 2">
        <input name="subject_2" list="school-subjects" defaultValue={subject2 ?? ""} className="input" placeholder="e.g. Computer Science" />
      </Field>
      <datalist id="school-subjects">
        {SCHOOL_SUBJECTS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/** "Physics · Computer Science", or null when neither is set. */
export function subjectsText(m: { subject_1: string | null; subject_2: string | null }) {
  return [m.subject_1, m.subject_2].filter(Boolean).join(" · ") || null;
}
