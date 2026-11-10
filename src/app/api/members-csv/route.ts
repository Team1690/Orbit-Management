import { NextResponse, type NextRequest } from "next/server";
import { getUser, isStaff } from "@/lib/auth";
import { csvCell, csvPhone, csvResponse } from "@/lib/csv";
import { NOT_SET, listStudents } from "@/lib/members";
import { today } from "@/lib/periods";

/**
 * Contact list of active students (captains and members). Each filter (grade, subteam, shirt)
 * can be given several times; one left out includes everyone. NOT_SET picks members with it empty.
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!isStaff(user)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const grades = sp.getAll("grade");
  const teams = sp.getAll("subteam");
  const shirts = sp.getAll("shirt");

  const members = (await listStudents()).filter(
    (m) =>
      (!grades.length || grades.includes(m.grade ?? NOT_SET)) &&
      // A subteam matches the main subteam or any extra team (Strategy, Drive team, …).
      (!teams.length || teams.includes(m.subteam ?? NOT_SET) || m.teams.some((t) => teams.includes(t))) &&
      (!shirts.length || shirts.includes(m.shirt_size ?? NOT_SET)),
  );

  const lines = [["Name", "Phone", "Grade", "Subteam", "School subjects", "Parent name", "Parent phone", "Shirt size"].map(csvCell).join(",")];
  for (const m of members) {
    const subjects = [m.subject_1, m.subject_2].filter(Boolean).join(", ");
    lines.push(
      [csvCell(m.name), csvPhone(m.phone), csvCell(m.grade), csvCell(m.subteam), csvCell(subjects), csvCell(m.parent_name), csvPhone(m.parent_phone), csvCell(m.shirt_size)].join(","),
    );
  }
  return csvResponse(`members-${today()}.csv`, lines);
}
