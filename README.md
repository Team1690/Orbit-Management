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

Open http://localhost:3000 and log in as `captain@demo.orbit`, `member@demo.orbit` or `mentor@demo.orbit`, password `demo1234`. The demo uses its own local database (`data/demo-pglite`), even when `DATABASE_URL` is set.

**Real use:**

```bash
npm run dev
```

Without `DATABASE_URL` this uses a built-in local Postgres ([PGlite](https://pglite.dev), files in `data/pglite`), so there is nothing to install. To work against the real database, copy `.env.example` to `.env.local` and fill in `DATABASE_URL`.

The first visit opens a setup page where you create the first captain account. Then:

1. **Meetings** → add your weekly slots (e.g. Sunday 16:00–20:00), choosing whether each runs every week, in-season only or off-season only. Meetings for the next three weeks are created and kept topped up automatically.
2. **Settings** → check the season dates (two starter seasons are created; edit them to match your calendar).
3. **Members → Add members** → add people one by one or paste a list (`name, email, subteam, grade`). Each person gets an invite link to set their password. Send it to them (WhatsApp is fine). The same button on a member's page makes a password-reset link.

## Putting it on members' phones

Phones need to reach the server, and three phone features only work over **HTTPS**: the in-app camera scanner, captain alert notifications, and installing the app on iPhone properly.

The app is hosted on **Vercel** (free Hobby plan, an `https://….vercel.app` address) with its data in a **Supabase** Postgres database, which **Hasura** can also connect to. None of these need a credit card.

1. **Database:** create a Supabase project (region Frankfurt). In **Connect**, copy the **Session pooler** string and put your database password in it. The app creates its tables on first start. Because the app talks to the database directly, turn off Supabase's **Data API** (Project Settings → Data API), so the tables can't be read through Supabase's public API.
2. **Vercel:** sign up with GitHub, then **Add New → Project** and import this repository. Vercel deploys the `main` branch. Before deploying, add two environment variables: `DATABASE_URL` (the Supabase string) and `CRON_SECRET` (any long random string). [vercel.json](vercel.json) runs the app in Frankfurt, next to the database.
3. **Background jobs:** Vercel only gives the server CPU during requests, so the app doesn't run its every-minute jobs itself there (Vercel's own free cron runs once a day). On [cron-job.org](https://cron-job.org) (free), create a job that runs every minute and sends `GET https://<your app>/api/cron` with the header `Authorization: Bearer <CRON_SECRET>`.
4. **Slack (optional):** at [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From scratch** for your workspace, turn on **Incoming Webhooks**, then **Add New Webhook** and pick the channel. Paste the `https://hooks.slack.com/…` address in the app's **Settings → Slack** and use **Send a test message**. Before each meeting with RSVPs (2 hours by default), the channel gets who can't come and who will be late. Reasons stay in the app.
5. **Hasura (optional):** connect a Hasura project to the same Supabase connection string to browse and edit the data, or to give other team apps a GraphQL API. Keep it behind its admin secret: the tables include password hashes, session tokens, medical notes and the app's own secrets (`settings`).

**Firebase App Hosting** works too (it needs the Blaze plan): create a backend for this repository with the `nodejs24` runtime, set the secrets named in [apphosting.yaml](apphosting.yaml) with `firebase apphosting:secrets:set`, put the app's address in `APP_URL` there, and call `/api/cron` every minute from Cloud Scheduler. Any other Node host works as well (`npm run build`, then `npm start` with `DATABASE_URL` set).

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase's Session pooler). Without it the app uses the local PGlite database. |
| `DATABASE_PATH` | Folder of the local PGlite database when `DATABASE_URL` isn't set (default `data/pglite`). |
| `DATABASE_POOL_MAX` | Database connections per server instance (default 2 on Vercel, 5 elsewhere). |
| `APP_URL` | Public address, e.g. `https://orbit.example.org`. Used in QR codes and invite links. On Vercel it defaults to the project's production domain; elsewhere, set this if the server sits behind a proxy and links come out wrong. |
| `VAPID_SUBJECT` | Contact for the push notification services, e.g. `mailto:captains@yourschool.org`. Defaults to `APP_URL` when it's https. |
| `CRON_SECRET` | Background jobs (creating meetings, missing-member alerts, automatic check-out) run every minute while the server is up. On serverless hosts (Vercel, App Hosting) they don't: call `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` every minute from an external scheduler. |
| `COOKIE_SECURE` | Set to `true` to force secure cookies if your proxy doesn't send `X-Forwarded-Proto`. |

**Installing on a phone:** open the site, then on iPhone tap *Share → Add to Home Screen* (in Safari); on Android tap *Install* when the app suggests it. Members only need to log in once.

**The meeting slide:** a captain opens **Show check-in code** (or `/qr`) on the presentation laptop when the check-in slide comes up. For a TV in the workshop, or to embed the live code inside a slide (e.g. PowerPoint's Web Viewer add-in), use the display link in **Settings**. It works without logging in, so keep it among captains.

**Backups:** everything is in the Postgres database. Take a copy any time with `pg_dump "<DATABASE_URL>" > backup.sql`.

## Code map

- `src/lib/`: data layer. `connect.ts` (Postgres server or local PGlite), `db.ts` (queries and transactions), `schema.ts` (tables and migrations), `visits.ts` (check-in/out, hours), `meetings.ts` (schedule, RSVPs), `attendance.ts` (present/late/absent and notice), `qr.ts` (rotating signed codes), `tick.ts` (background jobs), `auth.ts` (sessions).
- `src/actions/`: Server Actions for every form. Each checks the caller's role itself.
- `src/app/(app)/`: signed-in pages: `page.tsx` (member home), `scan/`, `profile/`, `dashboard/`, `members/`, `meetings/`, `hours/`, `settings/`.
- `src/app/qr/`, `src/app/checkin/`: the check-in screen and the URL the QR code points to.
- `scripts/seed-demo.mts`: demo data.

Stack: Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, and Postgres (Supabase in production, PGlite locally, so there's no database server to install for development).
