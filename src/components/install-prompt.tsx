"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "orbit-install-dismissed";

/** Suggests adding the app to the home screen: a button on Android, instructions on iPhone. */
export function InstallPrompt() {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    if (ios) setPlatform("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setPlatform("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!platform) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setPlatform(null);
  };

  return (
    <div className="card card-pad flex items-start gap-3 border-brand-200 bg-brand-50">
      <div className="flex-1 text-sm text-brand-900">
        <div className="font-semibold">Add Orbit to your home screen</div>
        {platform === "ios" ? (
          <p className="mt-1">
            In Safari, tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>. It opens like an app and keeps
            you logged in.
          </p>
        ) : (
          <p className="mt-1">Install it to open check-in and RSVPs in one tap.</p>
        )}
        {platform === "android" && event && (
          <button
            type="button"
            className="btn btn-primary btn-sm mt-2"
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              setPlatform(null);
            }}
          >
            Install app
          </button>
        )}
      </div>
      <button type="button" onClick={dismiss} className="text-sm text-brand-700" aria-label="Dismiss">
        Not now
      </button>
    </div>
  );
}
