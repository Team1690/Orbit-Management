"use server";

import { revalidatePath } from "next/cache";
import { inAudience, parseAudience } from "@/lib/audience";
import { requireUser } from "@/lib/auth";
import { run, tx } from "@/lib/db";
import { getMeeting, meetingWindow, setRsvp } from "@/lib/meetings";
import { getMember } from "@/lib/members";
import { openSpots, pickSlot, slotsFor, volunteersFor } from "@/lib/volunteers";

/**
 * "I'll volunteer" on a one-off meeting's request. Volunteering can only be a yes; it makes the
 * student expected at the meeting and answers its RSVP with "Coming" (they can still change that to
 * Late or Can't come, which frees their spot). In a transaction, so two students can't take the last spot.
 */
export async function volunteer(fd: FormData) {
  const user = await requireUser();
  const me = await getMember(user.id);
  if (!me || me.role === "mentor") return;
  const meetingId = Number(fd.get("meeting_id"));

  await tx(async () => {
    const m = await getMeeting(meetingId);
    if (!m || m.cancelled || m.schedule_id !== null || meetingWindow(m).start <= new Date()) return;
    if (inAudience(parseAudience(m.audience), me)) return;
    const slots = (await slotsFor([m.id])).get(m.id) ?? [];
    const volunteers = (await volunteersFor([m.id])).get(m.id) ?? [];
    if (volunteers.some((v) => v.user_id === me.id)) return;
    const slot = pickSlot(me, slots, await openSpots(m.id, slots, volunteers));
    if (!slot) return;
    await run("INSERT INTO volunteers (meeting_id, user_id, team, created_at) VALUES (?, ?, ?, ?)", m.id, me.id, slot.team, new Date().toISOString());
    if (m.rsvp) await setRsvp(m.id, me.id, "yes", null, null);
  });
  revalidatePath("/", "layout");
}
