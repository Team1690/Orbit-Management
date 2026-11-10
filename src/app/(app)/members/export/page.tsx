import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon } from "@/components/icons";
import { CHIP_CLASS, Card, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { EXTRA_TEAMS, GRADES, NOT_SET, SHIRT_SIZES, SUBTEAMS } from "@/lib/members";

export const metadata: Metadata = { title: "Export members" };

/** One row of filter chips; each ticked chip adds `name=value` to the download link. */
function Choices({ legend, name, options }: { legend: string; name: string; options: { value: string; label: string }[] }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={CHIP_CLASS}>
            <input type="checkbox" name={name} value={o.value} className="size-4 accent-brand-600" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const withNotSet = (values: string[]) => [...values.map((v) => ({ value: v, label: v })), { value: NOT_SET, label: "Not set" }];

export default async function ExportMembersPage() {
  await requireStaff();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Export members"
        subtitle="A CSV of active students (captains and members) for Excel or Google Sheets."
        actions={
          <Link href="/members" className="btn btn-secondary">
            Back to members
          </Link>
        }
      />
      <Card title="Who to include">
        {/* A plain GET form: the browser downloads the file and stays on this page. */}
        <form action="/api/members-csv" method="get" className="space-y-4">
          <p className="text-sm text-slate-500">
            Tick any mix of choices. A group left empty includes everyone; ticking several in one group includes members matching any of
            them.
          </p>
          <Choices legend="Grade" name="grade" options={withNotSet(GRADES)} />
          <Choices legend="Subteam or team" name="subteam" options={withNotSet([...SUBTEAMS, ...EXTRA_TEAMS])} />
          <Choices legend="Shirt size" name="shirt" options={withNotSet(SHIRT_SIZES)} />
          <p className="text-sm text-slate-500">
            Columns: name, phone, grade, subteam, school subjects, parent name, parent phone and shirt size.
          </p>
          <button className="btn btn-primary">
            <DownloadIcon /> Download CSV
          </button>
        </form>
      </Card>
    </div>
  );
}
