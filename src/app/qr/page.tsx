import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getUser } from "@/lib/auth";
import { currentOrNextMeeting, meetingWindow } from "@/lib/meetings";
import { fmtTime, relativeDay } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { QrDisplay } from "./qr-display";

export const metadata: Metadata = { title: "Check-in code" };

// Full-screen rotating check-in code. Open it on the projector during the meeting slide.
// Captains can open it directly; a TV or slide embed can use the display link from Settings.
export default async function QrPage({ searchParams }: PageProps<"/qr">) {
  const { k } = await searchParams;
  const key = typeof k === "string" ? k : undefined;
  const settings = await getSettings();
  const user = await getUser();
  if (user?.role !== "captain" && key !== settings.display_key) {
    return (
      <AuthShell title="Captains only" subtitle="Log in as a captain to show the check-in code, or use the display link from Settings.">
        <Link href="/login" className="btn btn-primary w-full">
          Log in
        </Link>
      </AuthShell>
    );
  }
  const meeting = await currentOrNextMeeting();
  let meetingLabel: string | null = null;
  if (meeting) {
    const { start, end } = meetingWindow(meeting);
    meetingLabel = `${meeting.title} · ${relativeDay(meeting.date)} ${fmtTime(start)}–${fmtTime(end)}`;
  }
  return (
    <QrDisplay
      displayKey={user?.role === "captain" ? undefined : key}
      teamName={settings.team_name}
      meetingLabel={meetingLabel}
      rotateMin={settings.qr_rotate_min}
    />
  );
}
