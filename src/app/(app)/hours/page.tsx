import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon } from "@/components/icons";
import { Avatar, Card, Empty, PageHeader } from "@/components/ui";
import { requireCaptain } from "@/lib/auth";
import { fmtDuration, fmtHours } from "@/lib/format";
import { listStudents } from "@/lib/members";
import { listSeasons, periodFromSearch, today } from "@/lib/periods";
import { addDays } from "@/lib/timeutil";
import { hoursByUser } from "@/lib/visits";

export const metadata: Metadata = { title: "Hours" };

export default async function HoursPage({ searchParams }: PageProps<"/hours">) {
  await requireCaptain();
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = periodFromSearch({ season: pick("season"), from: pick("from"), to: pick("to") });
  const seasons = listSeasons();
  const t = today();

  const hours = hoursByUser(period.from, period.to);
  const rows = listStudents()
    .map((m) => ({ m, h: hours.get(m.id) ?? { ms: 0, visits: 0 } }))
    .sort((a, b) => b.h.ms - a.h.ms || a.m.name.localeCompare(b.m.name));
  const totalMs = rows.reduce((s, r) => s + r.h.ms, 0);
  const max = rows[0]?.h.ms || 1;

  const bySubteam = new Map<string, { ms: number; n: number }>();
  for (const r of rows) {
    const key = r.m.subteam ?? "No subteam";
    const v = bySubteam.get(key) ?? { ms: 0, n: 0 };
    v.ms += r.h.ms;
    v.n += 1;
    bySubteam.set(key, v);
  }

  const query = new URLSearchParams(
    period.seasonId ? { season: String(period.seasonId) } : { from: period.startDate, to: period.endDate },
  ).toString();

  const quick = [
    { label: "This week", from: addDays(t, -localWeekday(t)), to: t },
    { label: "Last 30 days", from: addDays(t, -29), to: t },
  ];

  return (
    <div>
      <PageHeader
        title="Hours"
        subtitle={`${period.label} · ${fmtHours(totalMs)} team hours`}
        actions={
          <a href={`/api/hours-csv?${query}`} className="btn btn-secondary">
            <DownloadIcon /> Export CSV
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {seasons.map((s) => (
          <Link
            key={s.id}
            href={`/hours?season=${s.id}`}
            className={`btn btn-sm ${period.seasonId === s.id ? "btn-primary" : "btn-secondary"}`}
          >
            {s.name}
          </Link>
        ))}
        {quick.map((q) => (
          <Link
            key={q.label}
            href={`/hours?from=${q.from}&to=${q.to}`}
            className={`btn btn-sm ${!period.seasonId && period.startDate === q.from && period.endDate === q.to ? "btn-primary" : "btn-secondary"}`}
          >
            {q.label}
          </Link>
        ))}
        <form className="flex items-end gap-2">
          <input type="date" name="from" defaultValue={period.startDate} className="input w-auto py-1.5" aria-label="From" />
          <input type="date" name="to" defaultValue={period.endDate} className="input w-auto py-1.5" aria-label="To" />
          <button className="btn btn-secondary btn-sm">Apply</button>
        </form>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card pad={false} className="lg:col-span-2">
          {rows.length === 0 ? (
            <Empty>No members yet.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Member</th>
                    <th className="text-right">Hours</th>
                    <th className="hidden text-right sm:table-cell">Visits</th>
                    <th className="hidden text-right sm:table-cell">Avg / visit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ m, h }, i) => (
                    <tr key={m.id}>
                      <td className="text-slate-400 tabular-nums">{i + 1}</td>
                      <td>
                        <Link href={`/members/${m.id}`} className="flex items-center gap-2.5">
                          <Avatar name={m.name} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{m.name}</span>
                            <span className="mt-1 block h-1.5 w-32 overflow-hidden rounded-full bg-slate-100 sm:w-48">
                              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(h.ms / max) * 100}%` }} />
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{fmtHours(h.ms)}</td>
                      <td className="hidden text-right tabular-nums sm:table-cell">{h.visits}</td>
                      <td className="hidden text-right text-slate-600 tabular-nums sm:table-cell">{h.visits ? fmtDuration(h.ms / h.visits) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="By subteam">
          <ul className="space-y-2 text-sm">
            {[...bySubteam]
              .sort((a, b) => b[1].ms - a[1].ms)
              .map(([name, v]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span>
                    {name} <span className="text-xs text-slate-400">· {v.n} members</span>
                  </span>
                  <span className="font-semibold tabular-nums">{fmtHours(v.ms)}h</span>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function localWeekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
