export type FormState =
  | {
      error?: string;
      message?: string;
      /** A link to show with a copy button (invite links). */
      link?: string;
      links?: { label: string; value: string }[];
    }
  | undefined;

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Trimmed string, or null when empty. */
export function optStr(fd: FormData, key: string) {
  return str(fd, key) || null;
}

export function int(fd: FormData, key: string) {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && str(fd, key) !== "" ? Math.trunc(n) : null;
}

export function bool(fd: FormData, key: string) {
  return fd.get(key) === "on" || fd.get(key) === "1" || fd.get(key) === "true";
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
