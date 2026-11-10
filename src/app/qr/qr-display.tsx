"use client";

import { useEffect, useState } from "react";
import { OrbitLogo } from "@/components/icons";

type QrData = { svg: string; url: string; msUntilNext: number; present: number };

export function QrDisplay({
  displayKey,
  teamName,
  meetingLabel,
  rotateMin,
}: {
  displayKey?: string;
  teamName: string;
  meetingLabel: string | null;
  rotateMin: number;
}) {
  const [data, setData] = useState<QrData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/qr${displayKey ? `?k=${encodeURIComponent(displayKey)}` : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 401 ? "This display link is no longer valid." : "Couldn't load the code.");
        const next: QrData = await res.json();
        if (cancelled) return;
        setData(next);
        setError(null);
        setDeadline(Date.now() + next.msUntilNext);
        timer = setTimeout(load, next.msUntilNext + 150);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load the code.");
        timer = setTimeout(load, 3000);
      }
    }
    load();
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [displayKey]);

  const remaining = Math.max(0, deadline - now);
  const period = rotateMin * 60_000;
  const host = data ? new URL(data.url).hostname : "";
  const unreachable = host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  return (
    <main className="force-light flex min-h-dvh flex-col items-center justify-center gap-4 bg-gradient-to-b from-brand-900 to-brand-700 p-6 text-white">
      <div className="flex items-center gap-3">
        <OrbitLogo width={44} height={44} />
        <span className="text-2xl font-bold tracking-tight">{teamName}</span>
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Scan to check in</h1>
        {meetingLabel && <p className="mt-2 text-lg text-brand-100">{meetingLabel}</p>}
      </div>

      <div className="keep-light rounded-3xl bg-white p-5 shadow-2xl">
        {data ? (
          <div className="size-[min(52vh,80vw,620px)] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: data.svg }} />
        ) : (
          <div className="flex size-[min(52vh,80vw,620px)] items-center justify-center text-slate-400">{error ?? "Loading…"}</div>
        )}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-500 transition-[width] duration-200 ease-linear" style={{ width: `${(remaining / period) * 100}%` }} />
        </div>
      </div>

      <div className="text-center text-brand-100">
        <p className="text-lg">
          Open the <strong className="text-white">Orbit</strong> app and tap <strong className="text-white">Scan</strong>, or use your phone&apos;s camera.
        </p>
        {data && <p className="mt-1 text-sm">{data.present} checked in right now · the code changes every {rotateMin === 1 ? "minute" : `${rotateMin} minutes`}</p>}
        {error && data && <p className="mt-1 text-sm text-amber-300">{error}</p>}
        {unreachable && (
          <p className="mx-auto mt-3 max-w-xl rounded-xl bg-amber-400/20 px-4 py-2 text-sm text-amber-100">
            This code points to <strong>{host}</strong>, which phones can&apos;t reach. Open this page using the server&apos;s network
            address, or set APP_URL.
          </p>
        )}
      </div>

      <button
        type="button"
        className="fixed right-4 bottom-4 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      >
        Full screen
      </button>
    </main>
  );
}
