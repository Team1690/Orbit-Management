import { excuseMember } from "@/actions/presence";
import { fmtTime } from "@/lib/format";
import { SubmitButton } from "./client";
import { Badge } from "./ui";

// A member's "ask to be excused", shown next to their name to their subteam lead, lead mentors and
// captains, with a one-tap OK that checks them out at the time they asked.

export function LeaveTag({ at }: { at: string }) {
  return <Badge tone="yellow">Asks to leave · {fmtTime(at)}</Badge>;
}

export function ExcuseButton({ userId }: { userId: number }) {
  return (
    <form action={excuseMember} className="shrink-0">
      <input type="hidden" name="user_id" value={userId} />
      <SubmitButton className="btn btn-primary btn-sm" pendingText="…">
        OK
      </SubmitButton>
    </form>
  );
}
