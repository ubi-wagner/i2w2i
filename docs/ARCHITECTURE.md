# Architecture

## One service, one domain

Everything runs as **one Next.js service in one Railway container**, behind
`i2w2i.com`. Each app is a path:

| Path        | What                                   |
|-------------|----------------------------------------|
| `/login`    | Sign in (email link or password)       |
| `/`         | Dashboard: the apps you can open       |
| `/admin`    | People: invite, roles, app access      |
| `/account`  | Your name, password, sign out everywhere |
| `/events`   | Events app                             |
| `/couples`  | Couples app (hidden unless granted)    |

Apps are separated in the database (one Postgres schema each) and in code
(`app/<app>/` and `lib/<app>/`), not by separate deployments. If an app ever
needs its own container, it can move to a subdomain without changing the
sign-in model.

## Who is who

| Who | Account? | How they sign in | What they can do |
|---|---|---|---|
| **Admin** (Eric) | yes, `admin` | password or email link | Everything in non-sensitive apps; manages people and app access |
| **Creator** | yes, `creator` | password or email link | Creates, curates and publishes their own events |
| **Family member** | yes, `member` | email link only (no password) | Sees and contributes to what is shared with them |
| **Guest / outside contributor** | no | per-event link or QR code | Uploads and comments on one event only |
| **Public viewer** | no | nothing | Reads pages marked public |

Guests and public viewers are deliberately *not* rows in `core.users`. Each app
models them in its own schema, scoped to a single event or page, so a guest
link can never reach anything else.

## Two kinds of permission

1. **App access**: `core.user_app_roles (user, app, owner|editor|viewer)`.
   Decides what shows on the dashboard and who can open `/events` etc.
   Admin implicitly sees every non-sensitive app. **Sensitive apps (Couples)
   need an explicit grant, even for admin**, and return 404 to everyone else.
2. **Who can see a given thing** (an event page, an album, a photo). Each
   carries an audience: `public`, `family`, `selected people`, or
   `link only`. Built with the Events app and reused by later apps.

The rules live in `lib/access.ts` as pure functions with unit tests.

## Database

One Postgres, one schema per area:

- `core`: users, families, apps, app roles, sessions, sign-in links, audit log
- `events`: Events app tables (next)
- `rp`: Couples app tables (later)

Migrations are numbered SQL files in `db/migrations/`, applied in order on every
boot by `db/migrate.mjs`, each in a transaction. The runner stores a checksum
per file and refuses to start if an applied migration was edited.

## Sessions

- A session is a random 256-bit token in an httpOnly cookie (`i2w2i_session`).
  Only its SHA-256 is stored (`core.sessions`).
- Every request checks the session row, so deactivating someone or "sign out
  everywhere" takes effect immediately.
- Sessions last 30 days.

Email links are single-use. Sign-in links last 20 minutes and invite links last
7 days. Opening a link only shows a "Continue" button; signing in happens on
that POST, so email scanners that pre-fetch links can't use them up.

## Plans for the Couples app

Same container, but stricter by design:

- No public, family or link sharing exists in its code: only the couple.
- Its own storage bucket and short-lived signed URLs.
- Row-level security on `rp` tables keyed to the couple.
- A path-scoped step-up session (`Path=/couples`) on top of the normal sign-in.
