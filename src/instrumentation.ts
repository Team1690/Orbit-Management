export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Load the settings before the first request, so the team's time zone is known everywhere.
    const { getSettings } = await import("./lib/settings");
    await getSettings().catch((err) => console.error("[orbit] could not reach the database at startup", err));
    const { startBackgroundJobs } = await import("./lib/tick");
    startBackgroundJobs();
  }
}
