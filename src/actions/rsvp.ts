"use server";

import { revalidatePath } from "next/cache";
import { inAudience, parseAudience } from "@/lib/audience";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { int, str, type FormState } from "@/lib/forms";
import { LATE_BY_OPTIONS } from "@/lib/late-by";
import { getMeeting, meetingWindow, rsvpDeadline, setRsvp, type Rsvp, type RsvpResponse } from "@/lib/meetings";
import { getMember } from "@/lib/members";
import { getSettings } from "@/lib/settings";

export async function respondRsvp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const meeting = await getMeeting(Number(fd.get("meeting_id")));
  const response = str(fd, "response") as RsvpResponse;
  const note = str(fd, "note").slice(0, 300) || null;
  const lateBy = int(fd, "late_by");
  if (!meeting || meeting.cancelled || !meeting.rsvp) return { error: "This meeting isn't taking RSVPs." };
  const me = await getMember(user.id);
  const volunteered = !!(await one("SELECT 1 FROM volunteers WHERE meeting_id = ? AND user_id = ?", meeting.id, user.id));
  if (!me || (!volunteered && !inAudience(parseAudience(meeting.audience), me))) {
    return { error: "This meeting isn't for you, so there's nothing to answer." };
  }
  const now = new Date();
  if (meetingWindow(meeting).start <= now) return { error: "This meeting has already started." };
  if (!["yes", "late", "no"].includes(response)) return { error: "Pick an answer." };
  if (response === "late" && (lateBy === null || !LATE_BY_OPTIONS.includes(lateBy))) return { error: "Pick how late you'll be." };
  if (response === "no" && !note) return { error: "Tell the captains why you can't come." };

  // After the deadline only "Coming" and "Late" can switch between each other, until the start.
  const deadline = rsvpDeadline(meeting, (await getSettings()).rsvp_close_hours);
  if (deadline && now >= deadline) {
    const mine = await one<Pick<Rsvp, "response">>("SELECT response FROM rsvps WHERE meeting_id = ? AND user_id = ?", meeting.id, user.id);
    if (!mine || mine.response === "no" || response === "no") {
      return { error: "Answers for this meeting are closed. Ask a captain to change yours." };
    }
  }

  await setRsvp(meeting.id, user.id, response, response === "yes" ? null : note, response === "late" ? lateBy : null);
  revalidatePath("/", "layout");
  return { message: "Thanks, your answer was saved." };
}
