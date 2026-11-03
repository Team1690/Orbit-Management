import type { ReactNode } from "react";
import { OrbitLogo } from "./icons";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-brand-900 to-brand-700 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-white">
        <OrbitLogo width={36} height={36} />
        <span className="text-lg font-bold tracking-tight">Orbit Management</span>
      </div>
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}
