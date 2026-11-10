"use client";

import { useEffect, useState } from "react";

// The top bar's light/dark switch. The choice is saved on the device (localStorage "orbit-theme");
// until someone uses it, the app follows the phone's own setting. lib/theme.ts applies it before the
// page draws, so there's no flash of the wrong colours.

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("orbit-theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      {dark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
        </svg>
      )}
    </button>
  );
}
