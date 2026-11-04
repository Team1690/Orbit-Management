import { NextResponse } from "next/server";

/**
 * One CSV cell. Text a spreadsheet would run as a formula (starting with = + - @) gets a
 * leading ' so a value typed into a profile can't run as one when a captain opens the file.
 */
export function csvCell(value: string | number | null | undefined) {
  let s = value == null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A phone number kept as text, so Excel and Sheets don't drop the leading 0 of "050…" or turn "+972…" into a number. */
export function csvPhone(value: string | null | undefined) {
  if (!value) return "";
  return /^[0-9+\-() ]+$/.test(value) ? `"=""${value}"""` : csvCell(value);
}

/** A downloadable CSV file from ready-made lines (cells already passed through csvCell / csvPhone). */
export function csvResponse(filename: string, lines: string[]) {
  // BOM so Excel opens the file as UTF-8 (Hebrew names).
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
