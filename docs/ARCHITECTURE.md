# Architecture

## One service, one domain

Everything runs as **one Next.js service in one Railway container**, behind
`i2w2i.com`, with one Postgres and one storage bucket. Each app is a path:

| Path | What |
|---|---|
| `/login` | Sign in: email + password, or an emailed link |
| `/` | Dashboard: the apps you can open |
| `/admin` | People: invite, roles, app access (admin) |
| `/account` | Name, password, sign out everywhere |
| `/events` | Events you're on; create, manage, codes, QR cards, moderation |
| `/album/<slug>` | An event's album: join by code/QR, upload, gallery, chat |
| `/couples` | Couples app (hidden unless granted; not built) |

## Who is who, and how they get in

| Who | Account? | Gets in with | Can |
|---|---|---|---|
| **Admin** (Eric) | yes, `admin` | email + password | Everything in non-sensitive apps; manages people |
| **Creator** | yes, `creator` | email + password | Creates and runs events |
| **Family member** | yes, `member` | email + password | Joins events they're added to: album, uploads, chat |
| **Event guest** | no | the event's QR link, or its typed code as a fallback | Adds photos and/or sees that one album |
| **Public viewer** | no | the album link, if the album is public | Looks |

- Accounts get a one-time emailed (or copied) invite link and choose a
  password on first sign-in. "Email me a link" stays available as
  forgot-password.
- Guests are deliberately **not** `core.users`. They're rows in
  `events.guests`, scoped to one event, named by themselves, and only as
  good as the credential they came in with.

## Event access codes: one record, two credentials

Each `events.access_codes` row has:

- a **typed code** (e.g. `CB1106`, optional);
- a **QR link** (`/album/<slug>?t=<token>`);
- what holders may do: **add photos**, **see the album**, or both.

How they're stored:

- **Typed code:**
  - looked up by HMAC with `APP_SECRET`, so a copy of the database alone can't be used to guess codes;
  - also kept AES-GCM-encrypted with `APP_SECRET`, so owners can print it again;
  - attempts are rate-limited, and failures are recorded.
- **QR token:** derived from `APP_SECRET`, the row id and a version number. It's never stored, only its hash, and the card can be re-rendered at any time. "Replace QR" bumps the version and old cards stop working.

Either credential can be turned off without affecting the other. A guest's session dies as soon as the credential they used is turned off, or an owner removes them. What a code allows is read at request time, so changing a code's permissions applies to everyone already holding it.

**Changing `APP_SECRET` invalidates every printed QR card and every typed
code.** Set it once.

## Permissions are enforced by Postgres

The server connects as **`i2w2i_app`** (migration 002), a role that cannot
bypass row-level security and can't touch `rp` (Couples). Migrations run as
the owner. Boot refuses to start in production if the server's role could
bypass RLS.

Every query on the `events` schema runs inside `withCtx()`
(`lib/events/db.ts`), which tells Postgres who is asking for that
transaction: the user, admin flag, guest, guest's event and the code's
permissions. The policies in migration 003 then decide:

- **Events:**
  - drafts are visible to members only;
  - published albums are visible to their audience (`public`, `family`, or `invitees` meaning members plus code holders who can view).
- **Members and codes:** owners (and admin) manage them; curators moderate content.
- **Uploads:**
  - guests insert only into their own event, and only if their code allows uploads;
  - uploaders can finish their own uploads but can't feature, hide or move them;
  - viewers see only finished, unhidden items.
- **Chat:** members only.
- **Activity:** owners and curators read it; nobody can change it.

Access codes and guest sessions are resolved only through `SECURITY DEFINER`
functions (`resolve_code`, `resolve_qr`, `create_guest`, `resolve_guest`).
Anonymous requests can't read those tables at all.

**Boundary:** the resolver side (codes, guests) may read events; events,
uploads and messages never read access codes. One direction only, so a
fuller QR resolver can be added later without touching albums.

The tests in `tests/events-rls.test.ts` run against real Postgres as `i2w2i_app`.

## Tests

| What | Where | How |
|---|---|---|
| Unit tests and row-level security | `tests/` | `npm test` (security tests run when `DATABASE_URL` and `APP_DB_PASSWORD` are set) |
| End-to-end, in a real browser against the production build | `e2e/` | `npm run e2e` |

The end-to-end suites:

- **auth:** sign-in, invites, passwords, deactivation, sign out everywhere
- **album:** the shower flow on phones, activity records, venue Wi-Fi
- **matrix:** 9 kinds of visitor × 4 album states, pages and APIs
- **uploads:** reload, offline, stall, re-pick, limits
- **select:** select, zip, bulk moderation
- **decorate:** frames and filters
- **social:** comments and gift links

CI runs all of them on every push.

## Photos and videos

1. The phone asks `/album/<slug>/api/uploads` for presigned URLs.
2. It PUTs the **original** straight to the bucket; bytes never pass through the server.
3. It calls `…/uploads/<id>` with `action: complete`. The server confirms the object exists and its size, reads camera metadata from photos, and marks it ready.

Phones upload with XHR (for progress), two at a time, with three tries per file (each with a fresh URL). The screen is kept awake, and the cap is 2 GB per file.

- **Originals are never altered.** Photos also get a ~2048 px **preview made on the phone**. Re-encoding drops all metadata, including location.
- Galleries show previews. **Originals (with their location data) are only for owners and curators and their uploader.**
- Videos are shown as uploaded; their files can carry metadata, so they follow the same rule.
- Bucket keys are `events/<event id>/<upload id>/original.<ext>` and `…/preview.jpg`. The bucket's CORS rules are set by the server at start-up (`instrumentation.ts`).

### Interrupted uploads

Phones suspend pages when people switch apps, and venue networks drop.

- **Big files resume.** Files of 16 MB+ go up as S3 multipart (8 MB parts). The server reports which parts are safely stored, counting only parts of exactly the right size, so an interrupted upload continues from there.
- **The queue survives reloads.** The queue, and the files themselves when the browser allows, is kept in IndexedDB. After a reload or a discarded tab, uploads pick up by themselves. If the browser couldn't keep a file, the page names it and choosing it again resumes it (matched by size and name/type; phones report unreliable modified dates).
- **Stalls are restarted.** A transfer with no progress for 30 s restarts; coming back to the page restarts one that hasn't moved in 5 s.
- **Retries are careful.** They back off, wait while offline instead of using up attempts, and check before resending a part whose reply was lost. After that the upload shows Paused with a Resume button. Paused uploads resume on reconnect and when the page is shown again.
- **Abandoned uploads are cleaned up.** Uploads never finished are removed after 48 hours by an hourly job (`lib/housekeeping.ts`).

### Selecting, downloading, moderating

- The gallery has a Select mode: select all, by person or by day.
- Anyone who can see items can download a selection as a zip, streamed by the server one file at a time. Viewers get gallery copies; managers and the uploader get originals.
- Managers hide, show, star, unstar or delete in bulk.

### Comments, gifts, frames

- **Comments:** anyone who can see the album can comment (accounts as themselves, guests under their name). Authors and managers remove comments.
- **Gift links:** Venmo, PayPal or Cash App handles and registry links (https only), shown on the album with a QR each. Money never passes through i2w2i.
- **Frames, filters and captions** are a small manifest on the upload; the original is never touched:
  - photos get their gallery copy re-rendered on the phone;
  - videos are framed and filtered at playback;
  - filters are defined once as colour operations and rendered as both CSS and pixel math, since older Safari has no canvas filters;
  - the uploader can decorate for a day, until a manager hides the item.

## Who did what, from where

For accountability (bogus names, inappropriate uploads), every interaction is
recorded with as much as the request and device reveal.

| What | Recorded in |
|---|---|
| Album visits and QR scans, joins, failed codes (and what was typed), uploads, chat, moderation, guest removal | `events.activity` |
| Sign-ins (and failures), invites, admin changes | `core.audit_log` |

Each record includes:

- **Device id:** a random id in a long-lived cookie, assigned on first visit, which links one phone across names.
- **Network:** the IP address and forwarded-for chain.
- **Browser:** the user agent and client hints (model and OS version on Android).
- **Device:** language, timezone, screen, platform, connection type, as reported by the browser.
- **For uploads:** file name, the phone's file date, and the camera make/model, capture time and GPS read from the original.

Owners see this on the event's manage page: per photo (Details), per guest (with "same device also used"), and in an activity feed. Guests are told on the join form that their name, device and network details are recorded.

## Database

One Postgres, one schema per area:

- `core`: users, families, apps, app roles, sessions, sign-in links, audit log
- `events`: events, members, access codes, guests, uploads, messages, activity
- `rp`: Couples (later)

Migrations are numbered SQL files in `db/migrations/`. They're applied on
every boot, in order, each in a transaction, under an advisory lock. An edited
applied migration stops the boot.

## Sessions

- **Accounts:** a random 256-bit token in the httpOnly cookie `i2w2i_session` (only its SHA-256 is stored). It's checked on every request, so deactivation and "sign out everywhere" are immediate. Sessions last 30 days.
- **Guests:** a separate token in the cookie `i2w2i_guest`, scoped to `/album/<slug>`, lasting 60 days.
- **Emailed links:** single-use. A link only shows a Continue button, so email scanners can't use it up.

## Plans for the Couples app

It runs in the same container, but stricter by design:

- No public, family, link or code sharing exists in its code: only the couple.
- Its own bucket prefix and short-lived signed URLs; its own schema and role.
- Row-level security keyed to the couple.
- A path-scoped step-up session (`Path=/couples`) on top of the normal sign-in.
