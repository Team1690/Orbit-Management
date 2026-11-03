# Orbit Management

One internal app for the team: who is at school right now, hours per season, automatic RSVPs before every meeting, attendance (late / absent / gave notice), member profiles with captain-only notes, and a captain dashboard that ties it together.

It is an installable web app (PWA): members add it to their home screen on iPhone or Android and it opens like a native app. Captains use the same app on a laptop.

## Features

| Area | What it does |
| --- | --- |
| **QR check-in** | `/qr` shows a check-in code that changes every minute (set the number of minutes in Settings). Put it on the projector during the meeting slide. Members scan it with **Scan** inside the app, or with the phone's normal camera. A photo of the code stops working about a minute after it changes. |
| **Who's here / hours** | Every scan opens a visit; members check out from their home screen. Anyone still checked in at the cut-off time (default 23:00) is checked out automatically and credited until their meeting ended. Hours are totalled per season (in-season / off-season) or any date range, with CSV export. Mentors aren't counted in student hours. |
| **RSVPs** | Regular meetings are created automatically from the weekly schedule. Each weekly slot runs every week, in-season only or off-season only (dates outside an in-season period count as off-season), so the schedule switches by itself in January. Starting 72 hours before each one, members see "Will you come?" on their home screen: one tap for *Coming*; *Late* and *Can't come* ask for a short reason. |
| **Attendance** | Worked out from check-ins and RSVPs: *present*, *late* (checked in more than 1 minute after the start), *absent*, plus whether the member **gave notice** in advance. "Said yes but didn't come" is tracked too. Captains can override any entry. |
| **Captain alerts** | 5 minutes after each meeting starts, captains get an alert listing everyone who hasn't checked in (split into no notice / gave notice), plus who came late. It shows on the dashboard and, once a captain taps **Turn on alerts**, as a phone notification. Late check-ins appear live on the dashboard with how many minutes late. |
| **Mentors** | Mentors check in with one tap (no QR code) and announce when they're coming: regular weekly times, "can't come" for a single date, and extra one-off visits. Everyone sees this on the **Mentors** page; today's mentors also show on members' home screens and the dashboard. |
| **Member profiles** | Contact and parent details, main subteam (CAD, Mechanical, Robot software or Applications), any extra teams (Strategy, Electronics, Drive team, Media, Community outreach), the two school subjects they chose, grade, shirt size, medical notes, hours by season, attendance history, visit log (editable), and **captain-only notes**. |
| **Captain dashboard** | Who's at school now, live arrivals for the current meeting, who hasn't answered the RSVP (with a "copy reminder" button for WhatsApp), members who need attention, and an hours leaderboard. |

Roles: **captain** (everything), **member** (own home screen, scanning, RSVPs, own profile, Mentors page) and **mentor** (one-tap check-in, own weekly schedule, Mentors page). Members and mentors never see notes, other members' data or the QR code page.

## Running it

Needs Node.js 24 or newer.

```bash
npm install
```

**Try it with demo data** (28 fake members, five weeks of history, a meeting in progress):

```bash
npm run seed:demo
```

```bash
npm run dev:demo
```

Open http://localhost:3000 and log in as `captain@demo.orbit`, `member@demo.orbit` or `mentor@demo.orbit`, password `demo1234`. The demo uses its own database file (`data/demo.db`).

**Real use:**

```bash
npm run dev
```

The first visit opens a setup page where you create the first captain account. Then:

1. **Meetings** → add your weekly slots (e.g. Sunday 16:00–20:00), choosing whether each runs every week, in-season only or off-season only. Meetings for the next three weeks are created and kept topped up automatically.
2. **Settings** → check the season dates (two starter seasons are created; edit them to match your calendar).
3. **Members → Add members** → add people one by one or paste a list (`name, email, subteam, grade`). Each person gets an invite link to set their password. Send it to them (WhatsApp is fine). The same button on a member's page makes a password-reset link.

## Putting it on members' phones

Phones need to reach the server, and three phone features only work over **HTTPS**: the in-app camera scanner, captain alert notifications, and installing the app on iPhone properly. So for real use, run the app on a machine that stays on and give it an HTTPS address:

- **Simplest:** a school or team computer running `npm run build` and `npm start`, exposed with a free [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (gives you an `https://…` address with no router setup).
- **Hosted:** any Node host with a persistent disk, e.g. Railway, Render or Fly.io with a volume mounted at `data/`, or a small VPS.
- **Not** serverless hosts like Vercel: the database is a file (SQLite) and needs a disk that persists.

Environment variables (all optional):

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public address, e.g. `https://orbit.example.org`. Used in QR codes and invite links. Set this if the server sits behind a proxy and links come out wrong. |
| `DATABASE_PATH` | Where the SQLite file lives (default `data/orbit.db`). |
| `VAPID_SUBJECT` | Contact for the push notification services, e.g. `mailto:captains@yourschool.org`. Defaults to `APP_URL` when it's https. |
| `CRON_SECRET` | Background jobs (creating meetings, missing-member alerts, automatic check-out) already run every minute inside the server. If your host puts idle servers to sleep, call `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` from an external scheduler. |
| `COOKIE_SECURE` | Set to `true` to force secure cookies if your proxy doesn't send `X-Forwarded-Proto`. |

**Installing on a phone:** open the site, then on iPhone tap *Share → Add to Home Screen* (in Safari); on Android tap *Install* when the app suggests it. Members only need to log in once.

**The meeting slide:** a captain opens **Show check-in code** (or `/qr`) on the presentation laptop when the check-in slide comes up. For a TV in the workshop, or to embed the live code inside a slide (e.g. PowerPoint's Web Viewer add-in), use the display link in **Settings**. It works without logging in, so keep it among captains.

**Backups:** everything is in `data/orbit.db`. Copy that file (with the server stopped), or while it runs: `sqlite3 data/orbit.db ".backup backup.db"`.

## Code map

- `src/lib/`: data layer. `schema.ts` (tables and migrations), `visits.ts` (check-in/out, hours), `meetings.ts` (schedule, RSVPs), `attendance.ts` (present/late/absent and notice), `qr.ts` (rotating signed codes), `tick.ts` (background jobs), `auth.ts` (sessions).
- `src/actions/`: Server Actions for every form. Each checks the caller's role itself.
- `src/app/(app)/`: signed-in pages: `page.tsx` (member home), `scan/`, `profile/`, `dashboard/`, `members/`, `meetings/`, `hours/`, `settings/`.
- `src/app/qr/`, `src/app/checkin/`: the check-in screen and the URL the QR code points to.
- `scripts/seed-demo.mts`: demo data.

Stack: Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, and Node's built-in SQLite (no database server to install).
