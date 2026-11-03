// Database schema and migrations.
// Leaf module (no local imports) so scripts/ can load it directly with Node.
import type { DatabaseSync } from "node:sqlite";

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

// Each entry runs once, in order. Never edit an entry that has shipped; append a new one.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash     TEXT,
    role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'captain')),
    active            INTEGER NOT NULL DEFAULT 1,
    phone             TEXT,
    grade             TEXT,
    subteam           TEXT,
    birthday          TEXT,
    joined_year       INTEGER,
    shirt_size        TEXT,
    parent_name       TEXT,
    parent_phone      TEXT,
    medical_notes     TEXT,
    bio               TEXT,
    invite_hash       TEXT,
    invite_expires_at TEXT,
    created_at        TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Visible to captains only.
  CREATE TABLE captain_notes (
    id         INTEGER PRIMARY KEY,
    member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Dates are local team dates, YYYY-MM-DD, both inclusive.
  CREATE TABLE seasons (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('in_season', 'off_season')),
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL
  );

  -- Weekly recurring meetings. weekday: 0 = Sunday … 6 = Saturday. Times are local HH:MM.
  CREATE TABLE schedule (
    id              INTEGER PRIMARY KEY,
    weekday         INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT 'Team meeting',
    active          INTEGER NOT NULL DEFAULT 1,
    generated_until TEXT
  );

  CREATE TABLE meetings (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    date        TEXT NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    mandatory   INTEGER NOT NULL DEFAULT 1,
    rsvp        INTEGER NOT NULL DEFAULT 1,
    cancelled   INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    schedule_id INTEGER REFERENCES schedule(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX meetings_date ON meetings(date);

  CREATE TABLE rsvps (
    meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response     TEXT NOT NULL CHECK (response IN ('yes', 'late', 'no')),
    note         TEXT,
    responded_at TEXT NOT NULL,
    PRIMARY KEY (meeting_id, user_id)
  );

  -- Attendance is computed from check-ins and RSVPs; captains can override it per member.
  CREATE TABLE attendance_overrides (
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent')),
    notice     INTEGER NOT NULL DEFAULT 0,
    note       TEXT,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (meeting_id, user_id)
  );

  -- One row per stay at school. check_in/check_out are UTC ISO timestamps.
  CREATE TABLE visits (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in   TEXT NOT NULL,
    check_out  TEXT,
    in_method  TEXT NOT NULL DEFAULT 'qr' CHECK (in_method IN ('qr', 'manual')),
    out_method TEXT CHECK (out_method IN ('self', 'auto', 'manual')),
    edited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX visits_user ON visits(user_id, check_in);
  CREATE INDEX visits_check_in ON visits(check_in);
  CREATE UNIQUE INDEX visits_one_open ON visits(user_id) WHERE check_out IS NULL;

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  // 2: mentor role, school subjects, extra teams, season-specific slots, mentor schedules, alerts.
  // users and visits are rebuilt to change their CHECK constraints (runs with foreign keys off).
  `
  CREATE TABLE users_new (
    id                INTEGER PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash     TEXT,
    role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'captain', 'mentor')),
    active            INTEGER NOT NULL DEFAULT 1,
    phone             TEXT,
    grade             TEXT,
    subteam           TEXT,
    subject_1         TEXT,
    subject_2         TEXT,
    birthday          TEXT,
    joined_year       INTEGER,
    shirt_size        TEXT,
    parent_name       TEXT,
    parent_phone      TEXT,
    medical_notes     TEXT,
    invite_hash       TEXT,
    invite_expires_at TEXT,
    created_at        TEXT NOT NULL DEFAULT ${NOW}
  );
  INSERT INTO users_new (id, name, email, password_hash, role, active, phone, grade, subteam, birthday, joined_year,
                         shirt_size, parent_name, parent_phone, medical_notes, invite_hash, invite_expires_at, created_at)
  SELECT id, name, email, password_hash, role, active, phone, grade, subteam, birthday, joined_year,
         shirt_size, parent_name, parent_phone, medical_notes, invite_hash, invite_expires_at, created_at
    FROM users;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;

  -- in_method 'self': a mentor checking in without the QR code.
  CREATE TABLE visits_new (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in   TEXT NOT NULL,
    check_out  TEXT,
    in_method  TEXT NOT NULL DEFAULT 'qr' CHECK (in_method IN ('qr', 'manual', 'self')),
    out_method TEXT CHECK (out_method IN ('self', 'auto', 'manual')),
    edited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  INSERT INTO visits_new (id, user_id, check_in, check_out, in_method, out_method, edited_by)
  SELECT id, user_id, check_in, check_out, in_method, out_method, edited_by FROM visits;
  DROP TABLE visits;
  ALTER TABLE visits_new RENAME TO visits;
  CREATE INDEX visits_user ON visits(user_id, check_in);
  CREATE INDEX visits_check_in ON visits(check_in);
  CREATE UNIQUE INDEX visits_one_open ON visits(user_id) WHERE check_out IS NULL;

  -- Teams a member belongs to on top of their main subteam (Strategy, Drive team, …).
  CREATE TABLE member_teams (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team    TEXT NOT NULL,
    PRIMARY KEY (user_id, team)
  );
  UPDATE users SET subteam = 'Robot software' WHERE subteam = 'Programming';
  INSERT INTO member_teams (user_id, team)
    SELECT id, subteam FROM users WHERE subteam IN ('Strategy', 'Electronics', 'Drive team', 'Media', 'Community outreach');
  UPDATE users SET subteam = NULL WHERE subteam NOT IN ('CAD', 'Mechanical', 'Robot software', 'Applications');

  ALTER TABLE schedule ADD COLUMN applies TEXT NOT NULL DEFAULT 'all' CHECK (applies IN ('all', 'in_season', 'off_season'));
  ALTER TABLE meetings ADD COLUMN missing_alert_at TEXT;

  -- A mentor's regular weekly visits. weekday: 0 = Sunday. Times are local HH:MM.
  CREATE TABLE mentor_slots (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time   TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  -- Exceptions to the weekly plan: 'skip' one date of a slot, or an 'extra' one-off visit.
  CREATE TABLE mentor_changes (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('skip', 'extra')),
    slot_id    INTEGER REFERENCES mentor_slots(id) ON DELETE CASCADE,
    start_time TEXT,
    end_time   TEXT,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX mentor_changes_date ON mentor_changes(date);

  CREATE TABLE push_subscriptions (
    endpoint   TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Alerts shown to captains on the dashboard (and pushed to their phones).
  CREATE TABLE alerts (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL,
    meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  DELETE FROM settings WHERE key = 'qr_rotate_sec';
  `,
];

export function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (user_version >= MIGRATIONS.length) return;
  // Rebuilding a table must not cascade deletes into the tables that reference it.
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    for (let i = user_version; i < MIGRATIONS.length; i++) {
      db.exec("BEGIN");
      try {
        db.exec(MIGRATIONS[i]);
        const broken = db.prepare("PRAGMA foreign_key_check").all();
        if (broken.length) throw new Error(`Migration ${i + 1} left ${broken.length} broken references`);
        db.exec(`PRAGMA user_version = ${i + 1}`);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
