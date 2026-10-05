# i2w2i: working notes

Family app platform on Railway. Read `docs/ARCHITECTURE.md` first.

## Branches and deploy
- Work on `claude/main`. Eric merges `claude/main` → `main`; `main` deploys to Railway.
- Before pushing: `npm run typecheck && npm test && npm run build`, and for
  anything user-facing `npm run e2e` against a running build (see e2e/run.mjs
  for the env it needs). New features get an e2e suite or checks in one.
- Migrations that only exist on `claude/main` (not yet merged to `main`) may
  still be edited; once merged, never.

## Stack
- Next.js 16 (App Router, `proxy.ts` not middleware), React 19, TypeScript, Tailwind 3.
- Postgres via `postgres` (postgres.js) tagged templates in `lib/db.ts`. No ORM.
- Auth is in-house: `lib/auth/*`. No NextAuth.

## Conventions
- **Migrations**: add `db/migrations/NNN_name.sql`. Never edit one that's been
  applied; the runner refuses to boot on checksum drift. Fix forward.
- **Schemas**: `core` is the platform. Each app owns one schema (`events`, `rp`)
  and only reads `core` through user ids. App code lives in `app/<app>/` and
  `lib/<app>/`.
- **Every app page** starts with `requireApp('<key>')` (404 if no access).
  Admin pages use `requireAdmin()`. Never trust the proxy alone; it only
  checks that a cookie exists.
- **Access rules** go in `lib/access.ts` as pure functions with tests.
- **Sensitive apps** (Couples) are never implied by platform role, including
  admin. No public, family or link sharing code paths for them.
- **External people** (guests, public viewers) are not `core.users`; model them
  per app, scoped to one object.
- **Server actions** re-check the user and role themselves. Write an
  `audit()` row for anything that changes people or access.
- **Forms with `useActionState`**: React resets the form after the action, so
  return typed values in the state and use them as `defaultValue`.
- **Never log sign-in links in production** (`lib/email.ts` handles this).
- **Installable app:** `public/` (icons, `sw.js`) ships with the standalone
  server; keep the Dockerfile and CI copying it. The service worker must not
  cache or intercept requests (uploads, sign-in). Push only ever goes to the
  browsers' push services (`isPushEndpoint` in `lib/push-rules.ts`).
- **Help pages** (`app/help`, public) describe the real screens. Change a
  screen they show, update them; pictures in `public/help-img/` come from a
  made-up event, never real names, codes or QR cards.
- **There is no email.** People sign in with a username and password that
  whoever added them chose and passed on (`lib/auth/accounts.ts`). Never
  show or log a password except in that one box to the person who made it.
  Who may reset someone's password is `canResetPassword`: admin for anyone,
  hosts only for accounts they created. Don't widen it. A typed username
  that's taken is refused, never treated as "add that existing person".

## Events app rules
- **Every `events.*` query runs in `withCtx(ctx, …)`** (`lib/events/db.ts`).
  Row-level security (migration 003) is the real permission check; page code
  only decides what to show. The server's DB role (`i2w2i_app`) can't bypass
  RLS. Don't add a bypass connection for convenience.
- **Resolver boundary (don't reverse this):** access codes and guests may read
  `events.events`; events, uploads and messages must never read
  `events.access_codes`. Codes and guest sessions resolve only through the
  SECURITY DEFINER functions (`resolve_code`, `resolve_qr`, `create_guest`,
  `resolve_guest`). One authoritative access path: no share links beside it.
- **Credentials:** typed codes are HMAC'd (lookup) and AES-GCM-encrypted
  (display) with `APP_SECRET`; QR tokens are derived from it. Changing
  `APP_SECRET` kills every printed card.
- **Uploads go phone → bucket via presigned PUT**, never through the server.
  Originals are never modified; galleries use the phone-made preview
  (metadata stripped). Only managers and the uploader get originals.
- **Record interactions with `logActivity()`** (`lib/events/activity.ts`) for
  anything a guest or member does on an event, and `audit()` for account
  actions. Both capture IP, device id, user agent and headers; pass the
  browser's `collectClientInfo()` where there is a form or fetch.
- **Rate limits on guessing** (passwords, codes) count failures only
  (`tooManyFailures`/`recordFailure`): a venue shares one Wi-Fi address.
- **Uploads must survive interruption**: keep the multipart/resume path and
  the IndexedDB queue working; `e2e/suites/uploads.mjs` is the contract.
- **Uploads are reviewed (migration 008):** nobody but the uploader and the
  hosts (owners/helpers) sees an upload until a host approves it; hosts' own
  uploads are approved automatically. An approval covers the exact bytes the
  host saw: it's only possible once every upload link for it has expired
  (`writable_until`), and the uploader can't change an approved upload. Never
  serve an upload to others without going through the uploads RLS policy.
- **Guests are told** on the join form that name, device and network details
  are recorded. Keep that notice if you change the form.

## S-O-M (`apps/som`)
A separate service (som.i2w2i.com) with its own `package.json`, database,
bucket and CI jobs (`som`, `som-image`). Run its checks from `apps/som`:
`npm run typecheck && npm test && npm run build`, and `npm run e2e` against a
running build (see `apps/som/e2e/run.mjs`). Read `apps/som/README.md` first.
- **End-to-end encrypted.** Anything a couple writes or sends is encrypted on
  the phone (`lib/crypto.ts`) before any API call. The server stores and
  relays ciphertext; never add a route, log or notification that needs
  plaintext. Notifications say who did something, never what.
- **Never commit a couple's own menu, ideas pack, roleplays, profile lists**
  or anything from their scenes; those are imported in the app. Built-in
  ideas (`lib/ideas-data.ts`) and the built-in list to rate
  (`lib/inventory-data.ts`, ids fixed forever) are generic, use
  `{lead}`/`{follow}` for titles, and are **for pod members only**: import
  them only from `app/api/ideas`, never from anything that runs in the
  browser (`npm run check:bundle` fails the build if they leak into
  `.next/static`).
- **Roles are per scene.** A switched scene swaps lead and follow; the
  server uses `sceneFor`/`sceneMembers`/`others(scene, …)` (scene roles),
  the client wraps scenes in `SceneRoles`. Never check a pod role where a
  scene role is meant.
- **Deleting:** people delete their own content any time (bucket too); a
  whole scene needs every member's yes; an unsent draft is its author's.
- **Pause** is a safety control: either can pause, only whoever paused
  resumes, and nothing moves while paused. Don't weaken it.
- **Roleplays are asked for on their own** (🎭 Ask for a roleplay), apart
  from Select-O-Matic scenes: one roleplay, a day, a note. It's a nudge:
  the other reads all of it, you talk it over in the scene's notes, and a
  yes from either of you means it's on (nothing to build). Don't fold it
  back into the scene offer.
- **Enthusiastic consent:** whoever is offered or asked for a scene can
  always say "Not this time", no reason needed. Keep that path one tap.
- **The day is two-hour blocks** (`lib/blocks.ts`): getting ready (30
  min) or a 15-minute change-over, exactly two chores at home (errands
  when out), then Devotion and For {lead}, 15 minutes each; 8 hours adds a
  free hour and welcome home. Nothing twice in a day; check-ins at the end
  of each block; demands any time. Keep the novelty: Fill it for me skips
  what recent scenes used.
- **Both see the whole scene before it's agreed:** the answerer of an
  offer sees the staged scene (`SceneSummary`: what to get ready, what to
  wear, every block and task with its proof). Plans from older versions
  are upgraded on load (`upgradePlan`), never dropped.
- **Rewards are earned at the inspection.** A scene goes to aftercare only
  from the inspection (roleplay scenes too); don't add a way to skip it
  from a running scene. A roleplay itself isn't scored by the lead: each
  partner gives quick loves and dislikes (kept in their profile), and one a
  partner marked "not for me" can't be picked for them.
- Nothing in `apps/som` imports from the family site or vice versa; the root
  build ignores `apps/`.

