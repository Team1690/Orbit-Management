import { randomToken } from "./password";
import { all, one, run } from "./db";

export type Settings = {
  team_name: string;
  timezone: string;
  /** Minutes after the start time before a check-in counts as late. */
  late_grace_min: number;
  /** Minutes after the start when captains get an alert listing everyone not checked in yet. */
  missing_alert_min: number;
  /** How many hours before a meeting members are asked to RSVP. */
  rsvp_open_hours: number;
  /** Local time (HH:MM) when anyone still checked in is checked out automatically. */
  auto_checkout_time: string;
  /** How many days ahead meetings are created from the weekly schedule. */
  schedule_days_ahead: number;
  /** How often the check-in QR code changes, in minutes. */
  qr_rotate_min: number;
  qr_secret: string;
  /** Lets a projector or TV show the check-in QR without a captain logging in. */
  display_key: string;
  /** Web Push keys, created the first time a captain turns on alerts. */
  vapid_public?: string;
  vapid_private?: string;
};

const DEFAULTS: Omit<Settings, "qr_secret" | "display_key"> = {
  team_name: "Orbit 1690",
  timezone: "Asia/Jerusalem",
  late_grace_min: 1,
  missing_alert_min: 5,
  rsvp_open_hours: 72,
  auto_checkout_time: "23:00",
  schedule_days_ahead: 21,
  qr_rotate_min: 1,
};

const NUMERIC = new Set(["late_grace_min", "missing_alert_min", "rsvp_open_hours", "schedule_days_ahead", "qr_rotate_min"]);

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  for (const key of ["qr_secret", "display_key"] as const) {
    if (!stored[key]) {
      stored[key] = randomToken();
      setSetting(key, stored[key]);
    }
  }
  const out: Record<string, string | number> = { ...DEFAULTS };
  for (const [key, value] of Object.entries(stored)) {
    out[key] = NUMERIC.has(key) ? Number(value) : value;
  }
  return out as Settings;
}

export function setSetting(key: keyof Settings, value: string | number) {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    String(value),
  );
}

export function tz() {
  return one<{ value: string }>("SELECT value FROM settings WHERE key = 'timezone'")?.value ?? DEFAULTS.timezone;
}
