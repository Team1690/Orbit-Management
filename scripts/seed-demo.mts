// Builds the demo database (data/demo-pglite) with fake members, five weeks of meetings, check-ins and RSVPs.
// Run: npm run seed:demo   (then npm run dev:demo)
// Log in as captain@demo.orbit, member@demo.orbit, lead@demo.orbit (a subteam lead) or mentor@demo.orbit, password "demo1234".
// Always writes the local demo database, never the one in DATABASE_URL.
import fs from "node:fs";
import path from "node:path";
import { openDatabase, type Queryable } from "../src/lib/connect.ts";
import { hashPassword } from "../src/lib/password.ts";
import { migrate } from "../src/lib/schema.ts";
import { addDays, localParts, weekdayOf, zonedToUtc } from "../src/lib/timeutil.ts";

const TZ = "Asia/Jerusalem";
const dir = path.join(process.cwd(), "data", "demo-pglite");
fs.rmSync(dir, { recursive: true, force: true });

const db = await openDatabase({ dir });
await migrate(db);

// Deterministic randomness so the demo looks the same every time.
let seed = 1690;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const iso = (d: Date) => d.toISOString();
const minutes = (n: number) => n * 60_000;

const now = new Date();
const today = localParts(now, TZ).date;

/** A prepared INSERT: call it with the values, get the new row's id back (0 for tables without one). */
const insert =
  (q: Queryable, sql: string, returnsId = true) =>
  async (...params: unknown[]) =>
    (await q.query<{ id: number }>(returnsId ? `${sql} RETURNING id` : sql, params)).rows[0]?.id ?? 0;

let memberCount = 0;
await db.transaction(async (q) => {
  const set = insert(q, "INSERT INTO settings (key, value) VALUES ($1, $2)", false);
  await set("team_name", "Orbit 1690 (demo)");
  await set("timezone", TZ);

  const insertSeason = insert(q, "INSERT INTO seasons (name, kind, start_date, end_date) VALUES ($1, $2, $3, $4)");
  await insertSeason("Off-season 2026", "off_season", "2026-05-01", "2026-12-31");
  await insertSeason("2027 Season", "in_season", "2027-01-01", "2027-04-30");

  // --- Members -----------------------------------------------------------------------------
  const FIRST = ["Noa", "Amit", "Yael", "Itai", "Maya", "Omer", "Shira", "Yonatan", "Tamar", "Eitan", "Roni", "Daniel", "Lior", "Ariel", "Hila", "Nadav", "Talia", "Gal", "Ido", "Michal", "Yuval", "Adi", "Ofek", "Shaked", "Ella", "Ben"];
  const LAST = ["Levi", "Cohen", "Mizrahi", "Peretz", "Biton", "Friedman", "Avraham", "Shapiro", "Katz", "Dahan", "Golan", "Azulay", "Ben-David", "Segal", "Weiss", "Harel"];
  const SUBTEAMS = ["Mechanical", "Mechanical", "Mechanical", "CAD", "CAD", "Robot software", "Robot software", "Applications"];
  const EXTRA_TEAMS = ["Strategy", "Electronics", "Drive team", "Media", "Community outreach"];
  const SUBJECTS = ["Physics", "Computer Science", "Chemistry", "Biology", "Electronics", "Biotechnology", "Economics", "Literature", "Arts"];
  const REASONS = ["Exam tomorrow", "Family event", "Sick", "Doctor appointment", "Youth movement activity", "Matriculation exam prep", "Trip with class"];
  const LATE_NOTES = ["After tutoring", "Bus is late", "Dentist first", "After basketball practice"];
  const LATE_BY = [10, 20, 30, 40]; // minutes, the upper end of each "How late?" option
  const createdAt = iso(new Date(now.getTime() - 60 * 86_400_000));
  const pw = hashPassword("demo1234");

  const insertUser = insert(
    q,
    `INSERT INTO users (name, email, password_hash, role, phone, grade, subteam, subject_1, subject_2, birthday, joined_year, shirt_size,
                        parent_name, parent_phone, medical_notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
  );
  const insertTeam = insert(q, "INSERT INTO member_teams (user_id, team) VALUES ($1, $2)", false);

  type Demo = { id: number; reliability: number; punctual: number };
  const members: Demo[] = [];
  const people: [string, string, "member" | "captain"][] = [
    ["Gal Harel", "captain@demo.orbit", "captain"],
    ["Shira Katz", "shira.katz@demo.orbit", "captain"],
    ["Itai Peretz", "member@demo.orbit", "member"],
    ["Noa Levi", "lead@demo.orbit", "member"],
  ];
  /** Demo logins: always have a password and steady attendance. */
  const login = (email: string) => email === "member@demo.orbit" || email === "lead@demo.orbit";
  const usedNames = new Set(people.map((p) => p[0]));
  while (people.length < 28) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    people.push([name, `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@demo.orbit`, "member"]);
  }
  for (const [name, email, role] of people) {
    const grade = pick(["9", "10", "10", "11", "11", "12"]);
    const subject1 = pick(SUBJECTS);
    let subject2 = pick(SUBJECTS);
    while (subject2 === subject1) subject2 = pick(SUBJECTS);
    const id = await insertUser(
      name,
      email,
      // A few members haven't set a password yet.
      email.endsWith("@demo.orbit") && rand() < 0.1 && role === "member" && !login(email) ? null : pw,
      role,
      `05${Math.floor(rand() * 10)}-${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`,
      grade,
      role === "captain" || email === "lead@demo.orbit" ? "Mechanical" : pick(SUBTEAMS),
      rand() < 0.9 ? subject1 : null,
      rand() < 0.9 ? subject2 : null,
      `${2026 - 5 - Number(grade)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
      2026 - Math.floor(rand() * 3),
      pick(["S", "M", "M", "L", "XL"]),
      `${pick(FIRST)} ${name.split(" ")[1]}`,
      `05${Math.floor(rand() * 10)}-${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`,
      rand() < 0.15 ? pick(["Peanut allergy", "Asthma, has an inhaler", "Lactose intolerant"]) : null,
      createdAt,
    );
    // About half the team is also on one or two extra teams.
    const extras = new Set<string>();
    if (rand() < 0.45) extras.add(pick(EXTRA_TEAMS));
    if (rand() < 0.2) extras.add(pick(EXTRA_TEAMS));
    for (const team of extras) await insertTeam(id, team);
    // Reliability: most members come most of the time; a couple are struggling.
    const reliability = login(email) ? 0.9 : rand() < 0.15 ? 0.45 + rand() * 0.2 : 0.75 + rand() * 0.23;
    members.push({ id, reliability, punctual: 0.75 + rand() * 0.2 });
  }
  memberCount = members.length;
  // Noa leads Mechanical: the Subteam tab shows that subteam's attendance, read-only.
  await q.query("UPDATE users SET subteam_lead = 1 WHERE email = 'lead@demo.orbit'");

  // --- Mentors -----------------------------------------------------------------------------
  const insertMentor = insert(
    q,
    "INSERT INTO users (name, email, password_hash, role, subteam, phone, joined_year, created_at) VALUES ($1, $2, $3, 'mentor', $4, $5, $6, $7)",
  );
  const mentorIds: number[] = [];
  for (const [name, email, subteam] of [
    ["Dr. Ronit Avidan", "mentor@demo.orbit", "Robot software"],
    ["Yossi Ben-Ami", "yossi.mentor@demo.orbit", "Mechanical"],
    ["Michal Oren", "michal.mentor@demo.orbit", "CAD"],
  ]) {
    mentorIds.push(await insertMentor(name, email, pw, subteam, `05${Math.floor(rand() * 10)}-${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`, 2020, createdAt));
  }

  // --- Schedule and past meetings ----------------------------------------------------------
  const insertRule = insert(q, "INSERT INTO schedule (weekday, start_time, end_time, title, applies, generated_until) VALUES ($1, $2, $3, $4, $5, $6)");
  // Off-season: three evenings a week. In-season (from January): every school day, longer.
  const rules: { id: number; weekday: number }[] = [];
  for (const weekday of [0, 2, 4]) {
    rules.push({ id: await insertRule(weekday, "16:00", "20:00", "Team meeting", "off_season", addDays(today, -1)), weekday });
  }
  for (const weekday of [0, 1, 2, 3, 4]) await insertRule(weekday, "15:30", "21:00", "Build season meeting", "in_season", addDays(today, 21));
  await insertRule(5, "09:00", "13:00", "Friday build day", "in_season", addDays(today, 21));

  const insertMeeting = insert(
    q,
    "INSERT INTO meetings (title, date, start_time, end_time, mandatory, rsvp, schedule_id, cancelled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
  );
  const insertVisit = insert(q, "INSERT INTO visits (user_id, check_in, check_out, in_method, out_method) VALUES ($1, $2, $3, $4, $5)");
  const insertRsvp = insert(q, "INSERT INTO rsvps (meeting_id, user_id, response, note, responded_at, late_by_min) VALUES ($1, $2, $3, $4, $5, $6)", false);

  async function simulateMeeting(meetingId: number, start: Date, end: Date, live: boolean) {
    for (const m of members) {
      const comes = rand() < m.reliability;
      const late = comes && rand() > m.punctual;
      const rsvpAt = iso(new Date(start.getTime() - minutes(60 * (2 + rand() * 40))));
      if (comes) {
        if (late && rand() < 0.5) await insertRsvp(meetingId, m.id, "late", pick(LATE_NOTES), rsvpAt, pick(LATE_BY));
        else if (rand() < 0.75) await insertRsvp(meetingId, m.id, "yes", null, rsvpAt, null);
      } else if (rand() < 0.6) {
        await insertRsvp(meetingId, m.id, "no", pick(REASONS), rsvpAt, null);
      } else if (rand() < 0.35) {
        await insertRsvp(meetingId, m.id, "yes", null, rsvpAt, null); // said yes, didn't come
      }
      if (!comes) continue;

      // "Late" is more than one minute after the start.
      const arrive = new Date(start.getTime() + (late ? minutes(2 + rand() * 50) : minutes(-20 + rand() * 20)));
      if (live && arrive > now) continue; // not here yet
      const leave = new Date(end.getTime() + minutes(-40 + rand() * 60));
      const forgot = rand() < 0.06;
      if (live) {
        await insertVisit(m.id, iso(arrive), null, "qr", null);
      } else {
        await insertVisit(m.id, iso(arrive), iso(forgot ? end : leave), "qr", forgot ? "auto" : "self");
      }
    }
  }

  for (let d = addDays(today, -35); d < today; d = addDays(d, 1)) {
    const rule = rules.find((r) => r.weekday === weekdayOf(d));
    if (!rule) {
      // Some members also come in on Fridays to build.
      if (weekdayOf(d) === 5) {
        for (const m of members) {
          if (rand() < 0.25) {
            const a = zonedToUtc(d, pick(["09:00", "09:30", "10:00"]), TZ);
            await insertVisit(m.id, iso(a), iso(new Date(a.getTime() + minutes(150 + rand() * 120))), "qr", "self");
          }
        }
      }
      continue;
    }
    const cancelled = d === addDays(today, -12) ? 1 : 0; // one cancelled meeting
    const meetingId = await insertMeeting("Team meeting", d, "16:00", "20:00", 1, 1, rule.id, cancelled);
    if (!cancelled) await simulateMeeting(meetingId, zonedToUtc(d, "16:00", TZ), zonedToUtc(d, "20:00", TZ), false);
  }

  // --- A meeting happening right now, so the live dashboard has something to show -------------
  const local = localParts(now, TZ);
  const liveStartHour = Math.max(0, Math.min(local.hour - 1, 20));
  const liveStart = `${String(liveStartHour).padStart(2, "0")}:00`;
  const liveEnd = `${String(Math.min(liveStartHour + 4, 23)).padStart(2, "0")}:${liveStartHour + 4 > 23 ? "59" : "00"}`;
  const liveId = await insertMeeting("Build session", today, liveStart, liveEnd, 1, 1, null, 0);
  await simulateMeeting(liveId, zonedToUtc(today, liveStart, TZ), zonedToUtc(today, liveEnd, TZ), true);

  // --- Upcoming meetings with some RSVPs already in ----------------------------------------
  for (let d = today; d <= addDays(today, 21); d = addDays(d, 1)) {
    const rule = rules.find((r) => r.weekday === weekdayOf(d));
    if (!rule) continue;
    const meetingId = await insertMeeting("Team meeting", d, "16:00", "20:00", 1, 1, rule.id, 0);
    if (d <= addDays(today, 3)) {
      for (const m of members) {
        if (m.id === members[2].id) continue; // leave the demo member's RSVP open
        const r = rand();
        if (r < 0.55) await insertRsvp(meetingId, m.id, "yes", null, iso(now), null);
        else if (r < 0.62) await insertRsvp(meetingId, m.id, "late", pick(LATE_NOTES), iso(now), pick(LATE_BY));
        else if (r < 0.7) await insertRsvp(meetingId, m.id, "no", pick(REASONS), iso(now), null);
      }
    }
  }
  await q.query("UPDATE schedule SET generated_until = $1", [addDays(today, 21)]);

  // A one-off meeting this week for two of the extra teams only (see src/lib/audience.ts).
  await q.query(
    "INSERT INTO meetings (title, date, start_time, end_time, mandatory, rsvp, audience) VALUES ($1, $2, $3, $4, 1, 1, $5)",
    ["Strategy workshop", addDays(today, 4), "18:00", "20:00", JSON.stringify({ teams: ["Strategy", "Drive team"], members: [] })],
  );

  // --- Mentor schedules and visits -----------------------------------------------------------
  const insertSlot = insert(q, "INSERT INTO mentor_slots (user_id, weekday, start_time, end_time, note) VALUES ($1, $2, $3, $4, $5)");
  const [ronit, yossi, michal] = mentorIds;
  const ronitTue = await insertSlot(ronit, 2, "17:00", "19:30", "Autonomous and vision code");
  await insertSlot(ronit, 0, "17:30", "19:30", null);
  const yossiSun = await insertSlot(yossi, 0, "16:00", "20:00", "Machining and drivetrain");
  await insertSlot(yossi, 4, "16:00", "20:00", "Machining and drivetrain");
  await insertSlot(michal, 2, "18:00", "20:00", "CAD reviews");
  const insertChange = insert(
    q,
    "INSERT INTO mentor_changes (user_id, date, kind, slot_id, start_time, end_time, note) VALUES ($1, $2, $3, $4, $5, $6, $7)",
  );
  const nextWeekday = (wd: number, from = today) => {
    let d = from;
    while (weekdayOf(d) !== wd) d = addDays(d, 1);
    return d;
  };
  await insertChange(yossi, nextWeekday(0), "skip", yossiSun, null, null, null); // can't come this Sunday
  await insertChange(michal, nextWeekday(5), "extra", null, "10:00", "12:00", "Friday CAD workshop");
  await insertChange(ronit, nextWeekday(2, addDays(today, 1)), "skip", ronitTue, null, null, null);
  // One mentor is at school right now (checked in without the QR code), plus past visits.
  await insertVisit(yossi, iso(new Date(now.getTime() - minutes(50))), null, "self", null);
  for (let d = addDays(today, -35); d < today; d = addDays(d, 1)) {
    if (weekdayOf(d) === 2 && rand() < 0.8) await insertVisit(ronit, iso(zonedToUtc(d, "17:05", TZ)), iso(zonedToUtc(d, "19:30", TZ)), "self", "self");
    if (weekdayOf(d) === 0 && rand() < 0.8) await insertVisit(yossi, iso(zonedToUtc(d, "16:10", TZ)), iso(zonedToUtc(d, "19:50", TZ)), "self", "self");
  }

  // --- Captain notes ---------------------------------------------------------------------
  const insertNote = insert(q, "INSERT INTO captain_notes (member_id, author_id, body, created_at) VALUES ($1, $2, $3, $4)");
  const captainId = members[0].id;
  await insertNote(members[2].id, captainId, "Great progress on the intake. Could lead the mechanical sub-group next season.", iso(new Date(now.getTime() - 9 * 86_400_000)));
  await insertNote(members[5].id, captainId, "Missed several meetings, says it's because of exams. Check in with them after Hanukkah.", iso(new Date(now.getTime() - 4 * 86_400_000)));
  await insertNote(members[7].id, members[1].id, "Parents asked for a call about the district event trip.", iso(new Date(now.getTime() - 2 * 86_400_000)));
});

await db.close();
console.log(`Demo database written to ${dir} with ${memberCount} members.`);
console.log('Log in as captain@demo.orbit, member@demo.orbit, lead@demo.orbit or mentor@demo.orbit with password "demo1234".');
