"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { str, type FormState } from "@/lib/forms";
import { getMeeting, meetingWindow, setRsvp, type RsvpResponse } from "@/lib/meetings";

export async function respondRsvp(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const meeting = await getMeeting(Number(fd.get("meeting_id")));
  const response = str(fd, "response") as RsvpResponse;
  const note = str(fd, "note").slice(0, 300) || null;
  if (!meeting || meeting.cancelled || !meeting.rsvp) return { error: "This meeting isn't taking RSVPs." };
  if (meetingWindow(meeting).start <= new Date()) return { error: "This meeting has already started." };
  if (!["yes", "late", "no"].includes(response)) return { error: "Pick an answer." };
  if (response !== "yes" && !note) {
    return { error: response === "late" ? "Say roughly when you'll arrive." : "Tell the captains why you can't come." };
  }
  await setRsvp(meeting.id, user.id, response, response === "yes" ? null : note);
  revalidatePath("/", "layout");
  return { message: "Thanks, your answer was saved." };
}
