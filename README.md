# Orbit Management

One internal app for the team: who is at school right now, hours per season, automatic RSVPs before every meeting, attendance (late / absent / gave notice), member profiles with captain-only notes, and a captain dashboard that ties it together.

It is an installable web app (PWA) with a light/dark switch in the top bar: members add it to their home screen on iPhone or Android and it opens like a native app. Captains use the same app on a laptop.

## Features

| Area | What it does |
| --- | --- |
| **QR check-in** | `/qr` shows a check-in code that changes every minute (set the number of minutes in Settings). Put it on the projector during the meeting slide. Members scan it from the **Check in** card on their home screen (or the scan icon in the top bar), or with the phone's normal camera. A photo of the code stops working about a minute after it changes. |
| **Who's here / hours** | Every scan opens a visit; members check out from their home screen. Anyone still checked in 15 minutes after a meeting ends gets a reminder to check out (the delay is in Settings; 0 turns it off). Anyone still checked in at the cut-off time (default 23:00) is checked out automatically and credited until their meeting ended. **Settings → Clear history**, protected by the captain's password, deletes every meeting that has ended (with its RSVPs and attendance) and all finished check-ins. It keeps members, their details and notes, settings, seasons, the weekly schedule and upcoming meetings. The **Members** list sorts by hours, attendance, no-notice absences, grade or subteam; its **Hours report** totals hours per season (in-season / off-season) or any date range, with CSV export. Mentors aren't counted in student hours. |
| **RSVPs** | Regular meetings are created automatically from the weekly schedule. Each weekly slot runs every week, in-season only or off-season only (dates outside an in-season period count as off-season), so the schedule switches by itself in January. Starting 72 hours before each one (one-off meetings: as soon as they are created), members see "Will you come?" on their home screen: one tap for *Coming*; *Late* asks how late (up to 10 min, 10–20, …) and *Can't come* asks for a short reason. Members who turn on **Reminders** get a notification when answers open and a reminder (24 hours before) if they haven't answered. The home screen asks to turn them on until they are on for that device; after that the switch is in **Profile**. Answers close 6 hours before: captains then get the list of who didn't answer, and only *Coming* ↔ *Late* can still change until the start. Captains can change anyone's answer at any time on the meeting's sheet. All three times are in Settings. A meeting or weekly slot can also have its own **reminder**, a set number of hours before it, sent to everyone invited except those who said they can't come. Each meeting or weekly slot can be for the whole team, some teams (subteams and extra teams like Strategy) or picked people: only they get the RSVP and reminders and count for attendance. A meeting can be **open**: everyone sees it on their home screen and gets one FYI notification, which is quiet (no sound, on Android and computers) for those not invited. A **closed** meeting, the default, only shows to the people invited. A one-off meeting can be set to **No check-in needed**: whoever answers *Coming* or *Late* counts as present and gets the meeting's hours, without scanning in. Students can add **planned absences** in **Profile**, giving the dates and a short reason. Every meeting in that range is answered *Can't come* with that reason, including meetings added later. A one-off meeting can also **ask for volunteers**, such as 3 from Mechanical and 2 from anyone, or be for **only volunteers**. Students who aren't already expected see the request on their home screen and get a notification, and can only say yes. If spots are still open a set number of hours later, they're asked again. Volunteers are then expected like everyone invited, with their RSVP set to *Coming*, and get the meeting's reminder. All times in the app are 24-hour. |
| **Attendance** | Worked out from check-ins and RSVPs: *present*, *late* (checked in more than 1 minute after the start), *absent*, plus whether the member **gave notice** in advance. "Said yes but didn't come" is tracked too. Captains can override any entry. |
| **Captain alerts** | 5 minutes after each meeting starts, captains get an alert listing everyone who hasn't checked in (split into no notice / gave notice), plus who came late. It shows on the dashboard and, once a captain taps **Turn on alerts**, as a phone notification. Lead mentors get these alerts too, unless they turn them off in **Profile**; they still get each meeting's reminder. Late check-ins appear live on the dashboard with how many minutes late. |
| **Mentors** | Mentors check in with one tap (no QR code) and announce when they're coming: regular weekly times, "can't come" for a single date, and extra one-off visits, all of which they can edit. They can also fix the times of their own check-ins (a forgotten check-out, say) on their home screen. Everyone sees the plan on the **Mentors** page; today's mentors also show on members' home screens and the dashboard. A mentor can be in several subteams, and their home screen shows who from each one is coming to the next meeting. |
| **Member profiles** | Contact and parent details, main subteam (CAD, Mechanical, Robot software or Applications), any extra teams (Strategy, Electronics, Drive team, Media, Community outreach), the two school subjects they chose, grade, shirt size, medical notes, hours by season, attendance history, visit log (editable), and **captain-only notes**. **Members → Export CSV** downloads a contact list (name, phone, grade, school subjects, parent name and phone, shirt size), filtered by any mix of grades, subteams and shirt sizes. |
| **Captain dashboard** | Team hours (how long the team has met this season), who's at school now, the next weekly meeting and the next one-off meeting in the coming week (with live arrivals once they start), who hasn't answered the RSVP (with a "copy reminder" button for WhatsApp), members who need attention, and an hours leaderboard. |

Roles: **captain** (everything), **member** (own home screen, scanning, RSVPs, own profile, Mentors page) and **mentor** (one-tap check-in, own weekly schedule, Mentors page). A **subteam lead** is a member who also gets a **Subteam** tab: a read-only, phone-friendly view of their main subteam with who is coming to the next meeting, who is flagged (by the captains' thresholds in Settings) and each member's attendance history. It shows no RSVP reasons or contact details. A **lead mentor** is a mentor with the captains' **Dashboard**, **Members** and **Meetings**, including editing members, notes and visits and creating meetings, but not **Settings**. Only captains change roles or a captain's status. Members and mentors never see notes, other members' data or the QR code page.

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

Open http://localhost:3000 and log in as `captain@demo.orbit`, `member@demo.orbit`, `lead@demo.orbit` (a subteam lead), `mentor@demo.orbit` or `leadmentor@demo.orbit`, password `demo1234`. The demo uses its own local database (`data/demo-pglite`), even when `DATABASE_URL` is set.

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

1. **Database:** create a Supabase project (region Frankfurt). In **Connect**, copy the **Transaction pooler** string (port 6543) and put your database password in it. Use the Transaction pooler, not the Session pooler: the Session pooler allows only 15 connections in total, and serverless hosts open more than that. The app creates its tables on first start. Because the app talks to the database directly, turn off Supabase's **Data API** (Project Settings → Data API), so the tables can't be read through Supabase's public API.
2. **Vercel:** sign up with GitHub, then **Add New → Project** and import this repository. Vercel deploys the `main` branch. Before deploying, add two environment variables: `DATABASE_URL` (the Supabase string) and `CRON_SECRET` (any long random string). [vercel.json](vercel.json) runs the app in Frankfurt, next to the database.
3. **Background jobs:** Vercel only gives the server CPU during requests, so the app doesn't run its every-minute jobs itself there (Vercel's own free cron runs once a day). On [cron-job.org](https://cron-job.org) (free), create a job that runs every minute and sends `GET https://<your app>/api/cron` with the header `Authorization: Bearer <CRON_SECRET>`.
4. **Slack (optional):** at [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From scratch** for your workspace, turn on **Incoming Webhooks**, then **Add New Webhook** and pick the channel. Paste the `https://hooks.slack.com/…` address in the app's **Settings → Slack** and use **Send a test message**. Before each meeting with RSVPs (2 hours by default), the channel gets who can't come and who will be late. Reasons stay in the app.
5. **Hasura (optional):** connect a Hasura project to the same Supabase connection string to browse and edit the data, or to give other team apps a GraphQL API. Keep it behind its admin secret: the tables include password hashes, session tokens, medical notes and the app's own secrets (`settings`).

**Firebase App Hosting** works too (it needs the Blaze plan): create a backend for this repository with the `nodejs24` runtime, set the secrets named in [apphosting.yaml](apphosting.yaml) with `firebase apphosting:secrets:set`, put the app's address in `APP_URL` there, and call `/api/cron` every minute from Cloud Scheduler. Any other Node host works as well (`npm run build`, then `npm start` with `DATABASE_URL` set).

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase's Transaction pooler, port 6543). Without it the app uses the local PGlite database. |
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
