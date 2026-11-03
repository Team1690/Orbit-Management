import type { ReactNode } from "react";
import { logout } from "@/actions/auth";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

// Signed-in area. Each page also checks access itself, because layouts don't
// re-render on every navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <Nav name={user.name} role={user.role} teamName={getSettings().team_name} logout={logout} />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
