import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { nowIso, one, run } from "./db";
import { randomToken, sha256 } from "./password";

export type Role = "member" | "captain" | "mentor";
export type SessionUser = { id: number; name: string; email: string; role: Role };

const SESSION_COOKIE = "orbit_session";
const SESSION_DAYS = 180;

export async function secureCookies() {
  const h = await headers();
  return h.get("x-forwarded-proto") === "https" || process.env.COOKIE_SECURE === "true";
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = one<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    sha256(token),
    nowIso(),
  );
  return user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCaptain(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "captain") redirect("/");
  return user;
}

/** Only callable from Server Actions and Route Handlers (it sets a cookie). */
export async function startSession(userId: number) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), userId, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await secureCookies(),
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
  jar.delete(SESSION_COOKIE);
}

export function homeFor(user: { role: Role }) {
  return user.role === "captain" ? "/dashboard" : "/";
}

export function hasAnyUsers() {
  return !!one("SELECT 1 FROM users LIMIT 1");
}
