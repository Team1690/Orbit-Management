"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { ThemeToggle } from "./theme-toggle";
import {
  CalendarIcon,
  GridIcon,
  HomeIcon,
  LogoutIcon,
  MentorIcon,
  OrbitLogo,
  ScanIcon,
  SlidersIcon,
  UserIcon,
  UsersIcon,
} from "./icons";

type NavLink = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

const MENTORS_LINK: NavLink = { href: "/mentors", label: "Mentors", icon: MentorIcon };

// Scan isn't a tab: it's the home screen's Check in card and the icon in the top bar.
const MEMBER_LINKS: NavLink[] = [{ href: "/", label: "Home", icon: HomeIcon }, MENTORS_LINK, { href: "/profile", label: "Profile", icon: UserIcon }];

/** Subteam leads also get their subteam's page, after Home. */
const SUBTEAM_LEAD_LINKS: NavLink[] = [MEMBER_LINKS[0], { href: "/subteam", label: "Subteam", icon: UsersIcon }, ...MEMBER_LINKS.slice(1)];

const MENTOR_LINKS: NavLink[] = [{ href: "/", label: "Home", icon: HomeIcon }, MENTORS_LINK, { href: "/profile", label: "Profile", icon: UserIcon }];

// Hours isn't a tab: the Members page sorts by hours and links to the full hours report.
const CAPTAIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: GridIcon },
  { href: "/members", label: "Members", icon: UsersIcon },
  { href: "/meetings", label: "Meetings", icon: CalendarIcon },
  MENTORS_LINK,
];

/** Lead mentors: the captains' pages but Settings, plus Home for their one-tap check-in. */
const LEAD_MENTOR_LINKS: NavLink[] = [{ href: "/", label: "Home", icon: HomeIcon }, ...CAPTAIN_LINKS];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({
  name,
  role,
  subteamLead,
  leadMentor,
  teamName,
  logout,
}: {
  name: string;
  role: "member" | "captain" | "mentor";
  subteamLead: boolean;
  leadMentor: boolean;
  teamName: string;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const captain = role === "captain";
  const tabs = captain ? CAPTAIN_LINKS : leadMentor ? LEAD_MENTOR_LINKS : role === "mentor" ? MENTOR_LINKS : subteamLead ? SUBTEAM_LEAD_LINKS : MEMBER_LINKS;
  const desktop = captain
    ? [...CAPTAIN_LINKS, { href: "/settings", label: "Settings", icon: SlidersIcon }]
    : leadMentor
      ? [...LEAD_MENTOR_LINKS, { href: "/profile", label: "Profile", icon: UserIcon }]
      : tabs;

  return (
    <>
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href={captain ? "/dashboard" : "/"} className="flex min-w-0 items-center gap-2">
            <OrbitLogo />
            <span className="truncate font-bold tracking-tight text-slate-900">{teamName}</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {desktop.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive(pathname, l.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {captain && (
              <>
                <Link href="/" className="btn btn-ghost btn-sm hidden md:inline-flex">
                  My day
                </Link>
                <Link href="/" className="btn btn-ghost btn-sm md:hidden" aria-label="My day">
                  <HomeIcon />
                </Link>
                <Link href="/settings" className="btn btn-ghost btn-sm md:hidden" aria-label="Settings">
                  <SlidersIcon />
                </Link>
              </>
            )}
            {leadMentor && (
              <Link href="/profile" className="btn btn-ghost btn-sm md:hidden" aria-label="Profile">
                <UserIcon />
              </Link>
            )}
            {role !== "mentor" && (captain || pathname !== "/scan") && (
              <Link href="/scan" className="btn btn-ghost btn-sm" aria-label="Scan check-in code">
                <ScanIcon />
                <span className="hidden sm:inline">Scan</span>
              </Link>
            )}
            <span className="hidden px-2 text-sm text-slate-500 lg:inline">{name}</span>
            <ThemeToggle />
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm" aria-label="Log out" title="Log out">
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Bottom tab bar on phones, like a native app */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {tabs.map((l) => {
            const active = isActive(pathname, l.href);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand-600" : "text-slate-500"}`}
              >
                <Icon width={22} height={22} />
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
