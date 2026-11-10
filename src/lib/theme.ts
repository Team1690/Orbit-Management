// Runs in <head> before the page draws: dark mode if the device chose it with the top bar's toggle
// (components/theme-toggle.tsx), or, until then, if the phone itself is in dark mode.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("orbit-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
