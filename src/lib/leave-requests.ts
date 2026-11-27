import { all, one } from "./db";
import { firstName } from "./format";
import { pushToCaptains, pushToUsers } from "./push";

// "Ask to be excused": a member who can't check themselves out asks to leave, and their subteam lead
// (or a captain or lead mentor) OKs it with one tap. The request lives on the open visit
// (visits.excuse_requested_at); the OK checks them out at that time, marked 'excused'.

/** Tells the member's subteam lead(s) someone asked to leave; with no lead on that subteam, the captains. */
export async function notifyLeaveRequest(userId: number) {
  const member = await one<{ name: string; subteam: string | null }>("SELECT name, subteam FROM users WHERE id = ?", userId);
  if (!member) return;
  const payload = { title: `${member.name} asks to leave`, body: "Open the app and tap OK to excuse them.", tag: `leave-${userId}` };
  const leads = member.subteam
    ? (
        await all<{ id: number }>(
          "SELECT id FROM users WHERE active = 1 AND role = 'member' AND subteam_lead = 1 AND subteam = ? AND id <> ?",
          member.subteam,
          userId,
        )
      ).map((u) => u.id)
    : [];
  if (leads.length) await pushToUsers(leads, { ...payload, url: "/subteam" });
  else await pushToCaptains({ ...payload, url: "/dashboard" });
}

/** Tells the member they can go. */
export async function notifyExcused(userId: number, byName: string) {
  await pushToUsers([userId], { title: "You're excused", body: `${firstName(byName)} OK'd it. See you next time!`, url: "/", tag: `leave-${userId}` });
}
