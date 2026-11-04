import Link from "next/link";
import type { ReactNode } from "react";
import type { AttendanceEntry } from "@/lib/attendance";
import { lateByLabel } from "@/lib/late-by";

/** A tickable chip: a <label> around a checkbox that highlights when checked. */
export const CHIP_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", pad = true }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? "card-pad" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, href, tone = "default" }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  const body = (
    <>
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-pad block transition hover:border-brand-200 hover:shadow">
      {body}
    </Link>
  ) : (
    <div className="card card-pad">{body}</div>
  );
}

const BADGE_TONES = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  yellow: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-transparent ring-inset ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function AttendanceBadge({ entry }: { entry: Pick<AttendanceEntry, "status" | "notice"> | undefined }) {
  if (!entry) return <Badge>—</Badge>;
  const notice = entry.notice ? " · notified" : "";
  switch (entry.status) {
    case "present":
      return <Badge tone="green">Present</Badge>;
    case "late":
      return <Badge tone="yellow">Late{notice}</Badge>;
    case "absent":
      return <Badge tone={entry.notice ? "purple" : "red"}>Absent{notice}</Badge>;
    case "missing":
      return <Badge tone={entry.notice ? "purple" : "yellow"}>Not here yet{notice}</Badge>;
    case "upcoming":
      return <Badge>Upcoming</Badge>;
    case "not_required":
      return <Badge>Didn&apos;t attend</Badge>;
  }
}

export function RsvpBadge({ response, lateByMin }: { response: "yes" | "late" | "no" | undefined | null; lateByMin?: number | null }) {
  if (response === "yes") return <Badge tone="green">Coming</Badge>;
  if (response === "late") return <Badge tone="yellow">{lateByMin ? `Late · ${lateByLabel(lateByMin)}` : "Coming late"}</Badge>;
  if (response === "no") return <Badge tone="red">Can&apos;t come</Badge>;
  return <Badge>No answer</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Banner({ tone, children }: { tone: "green" | "red" | "yellow" | "blue"; children: ReactNode }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
    yellow: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-brand-200 bg-brand-50 text-brand-900",
  };
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [217, 262, 160, 24, 340, 190, 45, 290];
  const hue = hues[hash % hues.length];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 65% 48%)` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
