import type { Metadata } from "next";
import Link from "next/link";
import { ClockIcon, DownloadIcon, PlusIcon } from "@/components/icons";
import { Avatar, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { summarize, summaryFor } from "@/lib/attendance";
import { requireStaff } from "@/lib/auth";
import { fmtHours, pct } from "@/lib/format";
import { meetingsBetween } from "@/lib/meetings";
import { EXTRA_TEAMS, GRADES, SUBTEAMS, listMembers, roleLabel, type Member } from "@/lib/members";
import { currentPeriod, today } from "@/lib/periods";
import { hoursByUser, presentNow } from "@/lib/visits";

export const metadata: Metadata = { title: "Members" };

const FILTERS = [
  { value: "", label: "Active" },
  { value: "captains", label: "Captains" },
  { value: "mentors", label: "Mentors" },
  { value: "here", label: "At school now" },
  { value: "not_joined", label: "No password yet" },
  { value: "inactive", label: "Inactive" },
];

const SORTS = [
  { value: "", label: "Sort: name" },
  { value: "hours", label: "Sort: most hours" },
  { value: "attendance", label: "Sort: lowest attendance" },
  { value: "absences", label: "Sort: most no-notice absences" },
  { value: "grade", label: "Sort: grade" },
  { value: "subteam", label: "Sort: subteam" },
];

/** A value's place in a fixed order (grades, subteams); unknown or empty values go last. */
function rank(order: string[], value: string | null) {
  return value && order.includes(value) ? order.indexOf(value) : order.length;
}

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  await requireStaff();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const subteam = typeof sp.subteam === "string" ? sp.subteam : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  const sort = typeof sp.sort === "string" && SORTS.some((o) => o.value === sp.sort) ? sp.sort : "";

  const period = await currentPeriod();
  const hours = await hoursByUser(period.from, period.to);
  const summaries = await summarize(await meetingsBetween(period.startDate, today(), false));
  const here = new Set((await presentNow()).map((p) => p.user_id));

  const members = (await listMembers({ includeInactive: filter === "inactive" })).filter((m) => {
    if (filter === "inactive" && m.active) return false;
    if (filter === "captains" && m.role !== "captain") return false;
    if (filter === "mentors" && m.role !== "mentor") return false;
    if (filter === "here" && !here.has(m.id)) return false;
    if (filter === "not_joined" && m.has_password) return false;
    if (subteam && m.subteam !== subteam && !m.teams.includes(subteam)) return false;
    if (q && !`${m.name} ${m.email} ${m.phone ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // The list comes sorted by name, which also breaks ties.
  const hoursOf = (m: Member) => hours.get(m.id)?.ms ?? 0;
  const noNotice = (m: Member) => summaryFor(summaries, m.id).absent - summaryFor(summaries, m.id).absentNotice;
  const compare: Record<string, (a: Member, b: Member) => number> = {
    hours: (a, b) => hoursOf(b) - hoursOf(a),
    // No attendance yet (null) goes last.
    attendance: (a, b) => (summaryFor(summaries, a.id).rate ?? 2) - (summaryFor(summaries, b.id).rate ?? 2),
    absences: (a, b) => noNotice(b) - noNotice(a),
    grade: (a, b) => rank(GRADES, a.grade) - rank(GRADES, b.grade),
    subteam: (a, b) => rank(SUBTEAMS, a.subteam) - rank(SUBTEAMS, b.subteam),
  };
  if (compare[sort]) members.sort(compare[sort]);

  /** The same list sorted another way: a column heading's link. */
  const sortHref = (value: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (subteam) p.set("subteam", subteam);
    if (filter) p.set("filter", filter);
    if (value) p.set("sort", value);
    return `/members${p.size ? `?${p}` : ""}`;
  };
  const SortHeading = ({ value, children }: { value: string; children: string }) => (
    <Link href={sortHref(value)} className={sort === value ? "text-brand-700" : "hover:text-slate-800"}>
      {children}
      {sort === value && " ↓"}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${members.length} shown · hours and attendance for ${period.label}`}
        actions={
          <>
            <Link href="/hours" className="btn btn-secondary">
              <ClockIcon /> Hours report
            </Link>
            <Link href="/members/export" className="btn btn-secondary">
              <DownloadIcon /> Export CSV
            </Link>
            <Link href="/members/new" className="btn btn-primary">
              <PlusIcon /> Add members
            </Link>
          </>
        }
      />

      {/* Phones: search on its own row, then two controls per row. */}
      <form className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <input name="q" defaultValue={q} placeholder="Search name, email, phone" className="input col-span-2 sm:max-w-xs sm:flex-1" />
        <select name="subteam" defaultValue={subteam} className="input sm:w-auto">
          <option value="">All teams</option>
          <optgroup label="Subteams">
            {SUBTEAMS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </optgroup>
          <optgroup label="Also on">
            {EXTRA_TEAMS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </optgroup>
        </select>
        <select name="filter" defaultValue={filter} className="input sm:w-auto">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="input sm:w-auto" aria-label="Sort">
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary">Apply</button>
      </form>

      <Card pad={false}>
        {members.length === 0 ? (
          <Empty>No members match.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <SortHeading value="">Name</SortHeading>
                  </th>
                  <th className="hidden sm:table-cell">
                    <SortHeading value="subteam">Subteam</SortHeading>
                  </th>
                  <th className="hidden md:table-cell">
                    <SortHeading value="grade">Grade</SortHeading>
                  </th>
                  <th className="text-right">
                    <SortHeading value="hours">Hours</SortHeading>
                  </th>
                  <th className="text-right">
                    <SortHeading value="attendance">Attendance</SortHeading>
                  </th>
                  <th className="hidden text-right sm:table-cell">
                    <SortHeading value="absences">No-notice absences</SortHeading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const s = summaryFor(summaries, m.id);
                  const unexcused = s.absent - s.absentNotice;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td>
                        <Link href={`/members/${m.id}`} className="flex items-center gap-3">
                          <Avatar name={m.name} size={32} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 font-medium text-slate-900">
                              {m.name}
                              {here.has(m.id) && <span className="size-2 rounded-full bg-emerald-500" title="At school now" />}
                            </span>
                            <span className="flex gap-1">
                              {m.role === "captain" && <Badge tone="blue">Captain</Badge>}
                              {m.role === "mentor" && <Badge tone="purple">{roleLabel(m)}</Badge>}
                              {m.role === "member" && !!m.subteam_lead && <Badge tone="blue">Subteam lead</Badge>}
                              {!m.has_password && <Badge tone="yellow">No password</Badge>}
                              {!m.active && <Badge>Inactive</Badge>}
                            </span>
                            {/* Phones hide the Subteam and Grade columns, so show them here. */}
                            <span className="block text-xs text-slate-500 md:hidden">
                              {[m.subteam, m.grade && (m.grade === "Alumni" ? "Alumni" : `Grade ${m.grade}`)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden text-slate-600 sm:table-cell">
                        {m.subteam ?? "—"}
                        {m.teams.length > 0 && <div className="text-xs text-slate-400">+ {m.teams.join(", ")}</div>}
                      </td>
                      <td className="hidden text-slate-600 md:table-cell">{m.grade ?? "—"}</td>
                      <td className="text-right font-medium tabular-nums">{fmtHours(hours.get(m.id)?.ms ?? 0)}</td>
                      <td className="text-right tabular-nums">
                        <span className={s.rate === null ? "text-slate-400" : s.rate >= 0.85 ? "text-emerald-600" : s.rate >= 0.7 ? "text-amber-600" : "text-rose-600"}>
                          {pct(s.rate)}
                        </span>
                      </td>
                      <td className="hidden text-right tabular-nums sm:table-cell">{unexcused > 0 ? <Badge tone="red">{unexcused}</Badge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
