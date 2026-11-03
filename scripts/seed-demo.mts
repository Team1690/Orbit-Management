// Builds data/demo.db with fake members, five weeks of meetings, check-ins and RSVPs.
// Run: npm run seed:demo   (then npm run dev:demo)
// Log in as captain@demo.orbit, member@demo.orbit or mentor@demo.orbit, password "demo1234".
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/lib/password.ts";
import { migrate } from "../src/lib/schema.ts";
import { addDays, localParts, weekdayOf, zonedToUtc } from "../src/lib/timeutil.ts";

const TZ = "Asia/Jerusalem";
const file = path.join(process.cwd(), "data", "demo.db");
fs.mkdirSync(path.dirname(file), { recursive: true });
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });

const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
migrate(db);

// Deterministic randomness so the demo looks the same every time.
let seed = 1690;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const iso = (d: Date) => d.toISOString();
const minutes = (n: number) => n * 60_000;

const now = new Date();
const today = localParts(now, TZ).date;

db.exec("BEGIN");

const set = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
set.run("team_name", "Orbit 1690 (demo)");
set.run("timezone", TZ);

db.prepare("INSERT INTO seasons (name, kind, start_date, end_date) VALUES (?, ?, ?, ?)").run("Off-season 2026", "off_season", "2026-05-01", "2026-12-31");
db.prepare("INSERT INTO seasons (name, kind, start_date, end_date) VALUES (?, ?, ?, ?)").run("2027 Season", "in_season", "2027-01-01", "2027-04-30");

// --- Members -----------------------------------------------------------------------------
const FIRST = ["Noa", "Amit", "Yael", "Itai", "Maya", "Omer", "Shira", "Yonatan", "Tamar", "Eitan", "Roni", "Daniel", "Lior", "Ariel", "Hila", "Nadav", "Talia", "Gal", "Ido", "Michal", "Yuval", "Adi", "Ofek", "Shaked", "Ella", "Ben"];
const LAST = ["Levi", "Cohen", "Mizrahi", "Peretz", "Biton", "Friedman", "Avraham", "Shapiro", "Katz", "Dahan", "Golan", "Azulay", "Ben-David", "Segal", "Weiss", "Harel"];
const SUBTEAMS = ["Mechanical", "Mechanical", "Mechanical", "CAD", "CAD", "Robot software", "Robot software", "Applications"];
const EXTRA_TEAMS = ["Strategy", "Electronics", "Drive team", "Media", "Community outreach"];
const SUBJECTS = ["Physics", "Computer Science", "Chemistry", "Biology", "Electronics", "Biotechnology", "Economics", "Literature", "Arts"];
const REASONS = ["Exam tomorrow", "Family event", "Sick", "Doctor appointment", "Youth movement activity", "Matriculation exam prep", "Trip with class"];
const LATE_NOTES = ["~17:00, after tutoring", "Bus is late", "Coming at 16:45", "After basketball practice"];
const createdAt = iso(new Date(now.getTime() - 60 * 86_400_000));
const pw = hashPassword("demo1234");

const insertUser = db.prepare(
  `INSERT INTO users (name, email, password_hash, role, phone, grade, subteam, subject_1, subject_2, birthday, joined_year, shirt_size,
                      parent_name, parent_phone, medical_notes, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertTeam = db.prepare("INSERT INTO member_teams (user_id, team) VALUES (?, ?)");

type Demo = { id: number; reliability: number; punctual: number };
const members: Demo[] = [];
const people: [string, string, "member" | "captain"][] = [
  ["Gal Harel", "captain@demo.orbit", "captain"],
  ["Shira Katz", "shira.katz@demo.orbit", "captain"],
  ["Itai Peretz", "member@demo.orbit", "member"],
];
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
  const { lastInsertRowid } = insertUser.run(
    name,
    email,
    // A few members haven't set a password yet.
    email.endsWith("@demo.orbit") && rand() < 0.1 && role === "member" && email !== "member@demo.orbit" ? null : pw,
    role,
    `05${Math.floor(rand() * 10)}-${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`,
    grade,
    role === "captain" ? "Mechanical" : pick(SUBTEAMS),
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
  const id = Number(lastInsertRowid);
  // About half the team is also on one or two extra teams.
  const extras = new Set<string>();
  if (rand() < 0.45) extras.add(pick(EXTRA_TEAMS));
  if (rand() < 0.2) extras.add(pick(EXTRA_TEAMS));
  for (const team of extras) insertTeam.run(id, team);
  // Reliability: most members come most of the time; a couple are struggling.
  const reliability = email === "member@demo.orbit" ? 0.9 : rand() < 0.15 ? 0.45 + rand() * 0.2 : 0.75 + rand() * 0.23;
  members.push({ id, reliability, punctual: 0.75 + rand() * 0.2 });
}

// --- Mentors -----------------------------------------------------------------------------
const mentorIds = [
  ["Dr. Ronit Avidan", "mentor@demo.orbit", "Robot software"],
  ["Yossi Ben-Ami", "yossi.mentor@demo.orbit", "Mechanical"],
  ["Michal Oren", "michal.mentor@demo.orbit", "CAD"],
].map(([name, email, subteam]) =>
  Number(
    db
      .prepare("INSERT INTO users (name, email, password_hash, role, subteam, phone, joined_year, created_at) VALUES (?, ?, ?, 'mentor', ?, ?, ?, ?)")
      .run(name, email, pw, subteam, `05${Math.floor(rand() * 10)}-${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`, 2020, createdAt)
      .lastInsertRowid,
  ),
);

// --- Schedule and past meetings ----------------------------------------------------------
const insertRule = db.prepare("INSERT INTO schedule (weekday, start_time, end_time, title, applies, generated_until) VALUES (?, ?, ?, ?, ?, ?)");
// Off-season: three evenings a week. In-season (from January): every school day, longer.
const rules = [0, 2, 4].map((weekday) => ({
  id: Number(insertRule.run(weekday, "16:00", "20:00", "Team meeting", "off_season", addDays(today, -1)).lastInsertRowid),
  weekday,
}));
for (const weekday of [0, 1, 2, 3, 4]) insertRule.run(weekday, "15:30", "21:00", "Build season meeting", "in_season", addDays(today, 21));
insertRule.run(5, "09:00", "13:00", "Friday build day", "in_season", addDays(today, 21));

const insertMeeting = db.prepare(
  "INSERT INTO meetings (title, date, start_time, end_time, mandatory, rsvp, schedule_id, cancelled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const insertVisit = db.prepare("INSERT INTO visits (user_id, check_in, check_out, in_method, out_method) VALUES (?, ?, ?, ?, ?)");
const insertRsvp = db.prepare("INSERT INTO rsvps (meeting_id, user_id, response, note, responded_at) VALUES (?, ?, ?, ?, ?)");

function simulateMeeting(meetingId: number, start: Date, end: Date, live: boolean) {
  for (const m of members) {
    const comes = rand() < m.reliability;
    const late = comes && rand() > m.punctual;
    const rsvpAt = iso(new Date(start.getTime() - minutes(60 * (2 + rand() * 40))));
    if (comes) {
      if (late && rand() < 0.5) insertRsvp.run(meetingId, m.id, "late", pick(LATE_NOTES), rsvpAt);
      else if (rand() < 0.75) insertRsvp.run(meetingId, m.id, "yes", null, rsvpAt);
    } else if (rand() < 0.6) {
      insertRsvp.run(meetingId, m.id, "no", pick(REASONS), rsvpAt);
    } else if (rand() < 0.35) {
      insertRsvp.run(meetingId, m.id, "yes", null, rsvpAt); // said yes, didn't come
    }
    if (!comes) continue;

    // "Late" is more than one minute after the start.
    const arrive = new Date(start.getTime() + (late ? minutes(2 + rand() * 50) : minutes(-20 + rand() * 20)));
    if (live && arrive > now) continue; // not here yet
    const leave = new Date(end.getTime() + minutes(-40 + rand() * 60));
    const forgot = rand() < 0.06;
    if (live) {
      insertVisit.run(m.id, iso(arrive), null, "qr", null);
    } else {
      insertVisit.run(m.id, iso(arrive), iso(forgot ? end : leave), "qr", forgot ? "auto" : "self");
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
          insertVisit.run(m.id, iso(a), iso(new Date(a.getTime() + minutes(150 + rand() * 120))), "qr", "self");
        }
      }
    }
    continue;
  }
  const cancelled = d === addDays(today, -12) ? 1 : 0; // one cancelled meeting
  const { lastInsertRowid } = insertMeeting.run("Team meeting", d, "16:00", "20:00", 1, 1, rule.id, cancelled);
  if (!cancelled) simulateMeeting(Number(lastInsertRowid), zonedToUtc(d, "16:00", TZ), zonedToUtc(d, "20:00", TZ), false);
}

// --- A meeting happening right now, so the live dashboard has something to show -------------
const local = localParts(now, TZ);
const liveStartHour = Math.max(0, Math.min(local.hour - 1, 20));
const liveStart = `${String(liveStartHour).padStart(2, "0")}:00`;
const liveEnd = `${String(Math.min(liveStartHour + 4, 23)).padStart(2, "0")}:${liveStartHour + 4 > 23 ? "59" : "00"}`;
const live = insertMeeting.run("Build session", today, liveStart, liveEnd, 1, 1, null, 0);
simulateMeeting(Number(live.lastInsertRowid), zonedToUtc(today, liveStart, TZ), zonedToUtc(today, liveEnd, TZ), true);

// --- Upcoming meetings with some RSVPs already in ----------------------------------------
for (let d = today; d <= addDays(today, 21); d = addDays(d, 1)) {
  const rule = rules.find((r) => r.weekday === weekdayOf(d));
  if (!rule) continue;
  const { lastInsertRowid } = insertMeeting.run("Team meeting", d, "16:00", "20:00", 1, 1, rule.id, 0);
  if (d <= addDays(today, 3)) {
    for (const m of members) {
      if (m.id === members[2].id) continue; // leave the demo member's RSVP open
      const r = rand();
      if (r < 0.55) insertRsvp.run(Number(lastInsertRowid), m.id, "yes", null, iso(now));
      else if (r < 0.62) insertRsvp.run(Number(lastInsertRowid), m.id, "late", pick(LATE_NOTES), iso(now));
      else if (r < 0.7) insertRsvp.run(Number(lastInsertRowid), m.id, "no", pick(REASONS), iso(now));
    }
  }
}
db.prepare("UPDATE schedule SET generated_until = ?").run(addDays(today, 21));

// --- Mentor schedules and visits -----------------------------------------------------------
const insertSlot = db.prepare("INSERT INTO mentor_slots (user_id, weekday, start_time, end_time, note) VALUES (?, ?, ?, ?, ?)");
const [ronit, yossi, michal] = mentorIds;
const ronitTue = Number(insertSlot.run(ronit, 2, "17:00", "19:30", "Autonomous and vision code").lastInsertRowid);
insertSlot.run(ronit, 0, "17:30", "19:30", null);
const yossiSun = Number(insertSlot.run(yossi, 0, "16:00", "20:00", "Machining and drivetrain").lastInsertRowid);
insertSlot.run(yossi, 4, "16:00", "20:00", "Machining and drivetrain");
insertSlot.run(michal, 2, "18:00", "20:00", "CAD reviews");
const insertChange = db.prepare(
  "INSERT INTO mentor_changes (user_id, date, kind, slot_id, start_time, end_time, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const nextWeekday = (wd: number, from = today) => {
  let d = from;
  while (weekdayOf(d) !== wd) d = addDays(d, 1);
  return d;
};
insertChange.run(yossi, nextWeekday(0), "skip", yossiSun, null, null, null); // can't come this Sunday
insertChange.run(michal, nextWeekday(5), "extra", null, "10:00", "12:00", "Friday CAD workshop");
insertChange.run(ronit, nextWeekday(2, addDays(today, 1)), "skip", ronitTue, null, null, null);
// One mentor is at school right now (checked in without the QR code), plus past visits.
insertVisit.run(yossi, iso(new Date(now.getTime() - minutes(50))), null, "self", null);
for (let d = addDays(today, -35); d < today; d = addDays(d, 1)) {
  if (weekdayOf(d) === 2 && rand() < 0.8) insertVisit.run(ronit, iso(zonedToUtc(d, "17:05", TZ)), iso(zonedToUtc(d, "19:30", TZ)), "self", "self");
  if (weekdayOf(d) === 0 && rand() < 0.8) insertVisit.run(yossi, iso(zonedToUtc(d, "16:10", TZ)), iso(zonedToUtc(d, "19:50", TZ)), "self", "self");
}

// --- Captain notes ---------------------------------------------------------------------
const insertNote = db.prepare("INSERT INTO captain_notes (member_id, author_id, body, created_at) VALUES (?, ?, ?, ?)");
const captainId = members[0].id;
insertNote.run(members[2].id, captainId, "Great progress on the intake. Could lead the mechanical sub-group next season.", iso(new Date(now.getTime() - 9 * 86_400_000)));
insertNote.run(members[5].id, captainId, "Missed several meetings, says it's because of exams. Check in with them after Hanukkah.", iso(new Date(now.getTime() - 4 * 86_400_000)));
insertNote.run(members[7].id, members[1].id, "Parents asked for a call about the district event trip.", iso(new Date(now.getTime() - 2 * 86_400_000)));

db.exec("COMMIT");
db.close();
console.log(`Demo database written to ${file} with ${members.length} members.`);
console.log('Log in as captain@demo.orbit, member@demo.orbit or mentor@demo.orbit with password "demo1234".');
