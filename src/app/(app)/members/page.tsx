import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { Avatar, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { summarize, summaryFor } from "@/lib/attendance";
import { requireCaptain } from "@/lib/auth";
import { fmtHours, pct } from "@/lib/format";
import { meetingsBetween } from "@/lib/meetings";
import { EXTRA_TEAMS, SUBTEAMS, listMembers, roleLabel } from "@/lib/members";
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

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  await requireCaptain();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const subteam = typeof sp.subteam === "string" ? sp.subteam : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "";

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

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${members.length} shown · hours and attendance for ${period.label}`}
        actions={
          <Link href="/members/new" className="btn btn-primary">
            <PlusIcon /> Add members
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, email, phone" className="input max-w-xs flex-1" />
        <select name="subteam" defaultValue={subteam} className="input w-auto">
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
        <select name="filter" defaultValue={filter} className="input w-auto">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>

      <Card pad={false}>
        {members.length === 0 ? (
          <Empty>No members match.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hidden sm:table-cell">Subteam</th>
                  <th className="hidden md:table-cell">Grade</th>
                  <th className="text-right">Hours</th>
                  <th className="text-right">Attendance</th>
                  <th className="hidden text-right sm:table-cell">No-notice absences</th>
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
                              {!m.has_password && <Badge tone="yellow">No password</Badge>}
                              {!m.active && <Badge>Inactive</Badge>}
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
