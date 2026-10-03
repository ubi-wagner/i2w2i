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

- **Hosts are the admins of their events.** An event's owners manage
  everything on it: details and publishing, people (invite new ones or add
  existing accounts), guest codes and QR cards, guests, content, gift links
  and the activity record. Eric, as platform admin, is implicitly owner of
  every event and also manages all accounts (People page).
- **No email needed.** Accounts get a one-time link, shown to whoever
  invited them as text to copy and as a QR code to scan in person. The
  person opens it once and chooses a password.
- **Forgot password:** a new one-time link from the host who invited them,
  or from Eric. Signing in with it allows choosing a new password without
  the old one for 30 minutes, and other devices are signed out. A sign-in
  link opens someone's whole account, so hosts can only make links for
  accounts they invited (`canIssueLink` in `lib/access.ts`); everyone else
  comes to Eric.
- If email is set up later (`RESEND_API_KEY`), invites are also emailed and
  the login page offers "Email me a link".
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
- **hosts:** inviting people onto an event, one-time links as resets, co-hosts
- **theme:** event pages, looks, directions, schedule, printed cards
- **app:** the home-screen app and review notifications (local push stand-in)
- **help:** the public help pages, their pictures, printing, and the links to them

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

### Review before anyone else sees it

Nothing a guest, invitee or family member uploads is shown to anyone but them and the event's hosts (owners and helpers) until a host approves it. This is the uploads RLS policy (migration 008), so it covers the album, the public page, zips, originals and comments alike.

- Hosts' and helpers' own uploads are approved automatically.
- An approval is for the exact bytes the host looked at. Upload links last 10 minutes (`UPLOAD_URL_TTL`), each one extends `writable_until`, and the database refuses an approval while any link could still change the files. Phones fetch fresh links when one runs out.
- Once approved, the uploader can't change it (no new frame, caption or gallery copy). Before approval they can; each change restarts the 10 minutes.
- Hosts see a "waiting for your OK" banner and queue on the manage page (approve one at a time from the photo view, by selection, or all at once), and a count on their event cards. Uploaders see "Waiting" on their own photos.

### Comments, gifts, frames

- **Comments:** anyone who can see the album can comment (accounts as themselves, guests under their name). Authors and managers remove comments.
- **Gift links:** Venmo, PayPal or Cash App handles and registry links (https only), shown on the album with a QR each. Money never passes through i2w2i.

### Event pages

Hosts write their event's page in one editor with a live preview (manage page, "Your event page"):

- **Look** (`events.theme`): Enchanted forest, Garden or Classic. Colours are CSS variables under `[data-theme]` in `app/globals.css` (Tailwind's `stone` and `brand` read them), so every component follows the theme; drawings are inline SVG in `components/events/ThemeFrame.tsx`. Used on the join page, album, welcome page and printed cards.
- **Wording, directions, schedule, notes** (`events.page`, jsonb): shape and limits in `lib/events/page.ts` (`cleanPage` is the only way in). They become the invitation-style hero and action buttons (Directions with Google/Apple Maps/Waze, Schedule, Good to know, Send a gift) that open themed sheets.
- **What's public:** before someone joins, `public_event()` returns only the invitation wording. The address, schedule and notes come from `events.events` under RLS, so only people who can see the album get them.
- **Invite links made on an event's page** open `/album/<slug>/welcome`: the event's look, choose a password, straight into the album. The link is used up only once the password is accepted.
- **Frames, filters and captions** are a small manifest on the upload; the original is never touched:
  - photos get their gallery copy re-rendered on the phone;
  - videos are framed and filtered at playback;
  - filters are defined once as colour operations and rendered as both CSS and pixel math, since older Safari has no canvas filters;
  - the uploader can decorate for a day, until a manager hides the item.

## The installable app and notifications

i2w2i is a web app people can put on their home screen (Share → Add to Home Screen on iPhone; an install prompt on Android). It then opens full screen at `/`: the person's own landing page with the events they're on ("You're a guest/co-host"), albums published to the whole family, and a tile for each other app they've been given. Guests at a table never need to install anything.

- `app/manifest.ts`, icons in `public/icons/`, and `public/sw.js`, which only shows notifications and opens the right page when one is tapped. It doesn't cache or intercept requests. `public/` must ship with the standalone server (the Dockerfile copies it).
- **Notifications (web push):** people turn them on per phone (Manage page for hosts, Account page for everyone). On iPhone that only works from the home-screen app, and the page says so. Subscriptions are in `core.push_subscriptions`.
- **What's sent:** when someone who isn't a host uploads, the event's hosts and helpers get "N new photos are waiting for your OK", batched per event (one alert per ~90 seconds at most; `PUSH_REVIEW_DELAY_MS`). Tapping it opens the review queue. `events.review_summary()` gives the notifier names and counts without a signed-in context.
- **Keys:** the server makes its VAPID keys on first use and keeps them in `core.settings`; `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` override. Nothing to configure.
- **Safety:** the server only sends to the browsers' push services (Apple, Google, Mozilla, Microsoft; `isPushEndpoint`), so a subscription can't make it call other addresses. Dead subscriptions (404/410) are removed. Tests use a local HTTPS stand-in (`PUSH_ALLOW_ANY_ENDPOINT=1`, never in production).

## Help pages

`/help` (with `/help/start`, `/help/hosting`, `/help/faq`) is open to everyone, signed in or not, since the people who need it most can't get in yet. It's linked from the header, the sign-in page, the Manage checklist and the album. Each page has a Print / Save as PDF button; printing opens every folded answer.

The pictures in `public/help-img/` are real screens of a made-up event ("Sam & Riley", code PARTY), never a real event's names, codes or QR cards, because the pages are public. When a screen they show changes, update the words and re-shoot the picture.

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

- **Accounts:** a random 256-bit token in the httpOnly cookie `i2w2i_session` (only its SHA-256 is stored). It's checked on every request, so deactivation and "sign out everywhere" are immediate. Sessions slide: each visit renews them for 90 days (the cookie is renewed on page loads only, never on a POST, so signing out can't be undone).
- **Guests:** a separate token in the cookie `i2w2i_guest`, scoped to `/album/<slug>`, lasting 60 days.
- **Sign-in links:** single-use, handed over as text or QR (there's no email). Opening one signs no one in (message previews fetch links); pressing Continue, or choosing a password on an event's welcome page, does.

## Plans for the Couples app

It runs in the same container, but stricter by design:

- No public, family, link or code sharing exists in its code: only the couple.
- Its own bucket prefix and short-lived signed URLs; its own schema and role.
- Row-level security keyed to the couple.
- A path-scoped step-up session (`Path=/couples`) on top of the normal sign-in.
