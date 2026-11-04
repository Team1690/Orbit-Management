"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/actions/push";

type State = "loading" | "on" | "off" | "denied" | "ios-install" | "insecure" | "unsupported";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Turns notifications on or off for the device in use: "alerts" for captains, "reminders" for members. */
export function PushToggle({ publicKey, what = "alerts" }: { publicKey: string; what?: "alerts" | "reminders" }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!window.isSecureContext) return setState("insecure");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : Notification.permission === "denied" ? "denied" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const { ok } = await savePushSubscription(sub.toJSON());
      setState(ok ? "on" : "off");
      if (!ok) setNote("This browser's push service isn't supported.");
    } catch {
      setNote(`Couldn't turn on ${what} on this device.`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const { sent } = await sendTestPush();
    setNote(sent ? `Sent to ${sent} device${sent === 1 ? "" : "s"}.` : "None of your devices have notifications on.");
    setBusy(false);
  }

  const label = what === "alerts" ? "Alerts" : "Reminders";
  const messages: Partial<Record<State, string>> = {
    loading: "Checking this device…",
    denied: "Notifications are blocked for this app. Allow them in your phone or browser settings, then reload.",
    "ios-install": `On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), open it from there, then turn ${what} on.`,
    insecure: "Notifications need the app to be opened over https.",
    unsupported: "This browser doesn't support notifications.",
  };

  return (
    <div className="text-sm">
      {state === "on" || state === "off" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${state === "on" ? "text-emerald-700" : "text-slate-600"}`}>
            {state === "on" ? `${label} are on for this device.` : `${label} are off for this device.`}
          </span>
          {state === "on" ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={busy}>
                Send test
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={disable} disabled={busy}>
                Turn off
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={enable} disabled={busy}>
              Turn on {what}
            </button>
          )}
        </div>
      ) : (
        <p className="text-slate-500">{messages[state]}</p>
      )}
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
