import { NextResponse, type NextRequest } from "next/server";
import { getUser, isStaff } from "@/lib/auth";
import { csvCell, csvResponse } from "@/lib/csv";
import { listStudents } from "@/lib/members";
import { periodFromSearch } from "@/lib/periods";
import { hoursByUser } from "@/lib/visits";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!isStaff(user)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const period = await periodFromSearch({ season: sp.get("season") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const hours = await hoursByUser(period.from, period.to);
  const lines = [["Name", "Email", "Subteam", "Grade", "Hours", "Visits"].join(",")];
  for (const m of await listStudents()) {
    const h = hours.get(m.id) ?? { ms: 0, visits: 0 };
    lines.push([m.name, m.email, m.subteam, m.grade, (h.ms / 3_600_000).toFixed(2), h.visits].map(csvCell).join(","));
  }
  return csvResponse(`hours-${period.startDate}-to-${period.endDate}.csv`, lines);
}
