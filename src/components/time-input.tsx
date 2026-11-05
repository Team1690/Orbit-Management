"use client";

import { useState } from "react";

// A 24-hour time picker that submits "HH:MM" under `name`, like <input type="time">. The browser's own
// time input follows the phone's 12/24-hour setting and can show AM/PM, so this uses an hour list
// (00–23) and a minute list instead.

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

export function TimeInput({
  name,
  defaultValue = "",
  required = false,
  step = 5,
  compact = false,
  "aria-label": label,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  /** Minutes between choices: 5 for meeting times, 1 for exact check-in times. */
  step?: number;
  /** Smaller lists for tight rows. */
  compact?: boolean;
  "aria-label"?: string;
}) {
  const [h0 = "", m0 = ""] = defaultValue ? defaultValue.split(":") : [];
  const [hour, setHour] = useState(h0);
  const [minute, setMinute] = useState(m0);
  // Every `step` minutes, plus the saved minute when it falls between (a check-in at 15:47).
  const minutes = [...new Set([...Array.from({ length: 60 / step }, (_, i) => String(i * step).padStart(2, "0")), ...(m0 ? [m0] : [])])].sort();
  const cls = compact ? "input w-auto px-1.5 py-1 text-xs" : "input w-auto px-2";

  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <select
        value={hour}
        onChange={(e) => {
          setHour(e.target.value);
          if (e.target.value && !minute) setMinute("00");
        }}
        required={required}
        className={cls}
        aria-label={label ? `${label}: hour` : "Hour"}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h}>{h}</option>
        ))}
      </select>
      <span className="text-slate-500">:</span>
      <select value={minute} onChange={(e) => setMinute(e.target.value)} required={required || !!hour} className={cls} aria-label={label ? `${label}: minutes` : "Minutes"}>
        <option value="">--</option>
        {minutes.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <input type="hidden" name={name} value={hour && minute ? `${hour}:${minute}` : ""} />
    </span>
  );
}
