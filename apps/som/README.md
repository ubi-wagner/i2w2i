# S-O-M

A private app for a couple (or a poly pod) to build a scene together and run
it: one person drafts it from a menu, the other chooses and starts it, and
the app carries the tasks, proof, check-ins, timers and notifications, then
the scorecard, aftercare and a record to look back on.

It lives at **som.i2w2i.com** as its own Railway service, built from this
folder, with **its own Postgres database and its own bucket**. It shares
nothing with the family site except the repository.

## Privacy

Everything a couple writes or sends is encrypted on their phones before it
leaves them. The server stores ciphertext and can't read it.

| Encrypted on the phone (server can't read) | Visible to the server |
|---|---|
| The menu, the pod's name and titles | Usernames and account names (needed to sign in) |
| Scene plans, tasks, notes, writing, check-ins | Who is in a pod and which role they have |
| Offer notes; the follow's capacity and note when answering; demands and praise | An offered scene's window: day, from and until (for reminders and so offers don't overlap) |
| Roleplays, switch titles, profiles (ratings and notes) | Whether a scene is switched, whether it's a roleplay (not which one) and who offered it (it decides who may do what) |
| Scorecards (overall and per task), consequences, rewards, aftercare, reflections | A scene's stage, and when things happened |
| Photos, videos, voice notes, files (and their thumbnails, names, sizes in the file) | Encrypted file sizes, check-in times, countdown times |

- **Keys.** Each pod has one key (AES-256-GCM), kept on each phone where it
  can't be exported. A backup of it, wrapped with each person's **vault
  passphrase** (PBKDF2, 600,000 rounds), lets a new phone unlock. The
  passphrase never leaves the phone.
- **Adding a partner.** Their sign-in comes with a **key link**. The secret is
  after the `#`, which browsers never send to a server; it opens once, for
  that person only, and they then choose their own passphrase.
- **Files** get their own key each and are encrypted in 8 MiB pieces, so big
  videos upload in parts, each retried on its own (a dropped connection
  picks up where it stopped; closing the app mid-send means sending it
  again, and the unfinished one can be removed). Videos and files are up to
  250 MB, so they can be opened on a phone. Photos are redrawn on the phone first
  (when the browser can read the format, as iPhones and Android phones do),
  which drops location and camera details.
- **Notifications** only say that something happened and who did it ("Sunny
  sent something for review"), never what.
- **Forgetting the passphrase.** If one of you forgets it, the other can make
  you a new key link in Settings. If you both lose every phone *and* both
  passphrases, the content can't be recovered by anyone, including the admin.
- **Saved copies.** "Save to phone" saves a normal, decrypted copy into your
  phone's photos or files. What happens to it there is up to you.

## Deleting

- Anything **you** sent (a photo, a note, a check-in) you can delete any time;
  it's removed from the bucket too. Deleting a note deletes what was sent
  with it.
- A **whole scene** goes only when **everyone in the pod agrees**. Asking
  shows on the other phone; you can take it back. A draft nobody else has
  seen is just its author's.
- Each of you can save to your phone what the other sends.

## How a scene runs

There are two ways in:

- **Either of you offers (or asks for) a window of time**: the lead's
  workday, say, or the follow asking for a scene. **Offer {follow} a
  scene** / **Ask {lead} for a scene** on the home screen (a Select-O-Matic
  scene, built from the menu): who leads, today, tomorrow or another day,
  from and until (2, 4 or 8 hours in one tap), and a note. The other one
  answers: accept, ask for a change, or **not this time**. Windows
  don't overlap another offered or planned scene, and an offer whose time
  has passed can't be accepted. The follow answers by their schedule and
  their **capacity** (Light, Normal or Full: how much they can take on that
  day): **accept**, or **ask for a change** (another window, a different
  capacity, or both, and why). The lead agrees, offers something else or
  takes it back. Once agreed, the lead's builder shows the window and the
  follow's capacity, and lays the day out in blocks to fit (a light day
  has one work block fewer); **Fill it for me** fills it in one tap;
  change anything, or change the time (the follow answers again). Then
  **send** it. The follow sees the tasks block by block with their times
  and a countdown, gets a reminder when the window opens, and can
  **start** it from half an hour before until the window closes. The lead
  can take a sent scene back to change it until then. Once a scene is
  agreed or sent, **either of you** can ask for a different time or **call
  it off** (one tap and a confirm; it goes back to a draft and its time is
  freed), and the lead can say **not now** to a proposal or give it a time.
- **The follow drafts one**: pick how long, then tap to pick for each
  block; it saves as you go. **Send** it to the lead, who adjusts
  anything and **starts it now**.

**The whole scene, before anyone says yes.** The lead can build a scene
first (**Build it first, then offer it**) and see it as one sheet (**See
the whole scene**): what to get ready beforehand (equipment, new clothes:
a list the lead writes), what to wear, every block with its times and
tasks and the proof each needs, the arrival routine and check-ins. The one
answering an offer sees that same sheet before accepting, and the follow
can tick off what they've got ready on the sent scene. An offer made
before anything is built says so.

**Scenes from before an update come over whole.** A draft or proposal made
before blocks keeps its rooms (with the evidence picked for them), story
assignment, writing prompt and own task, placed into blocks (nothing is
dropped; a part over its count is left for the lead to trim). Running
scenes keep their tasks, and a scene keeps its arrival routine as it was
when it started or was sent, whatever later happens to the menu. Importing
a menu keeps the ids of items with the same wording, and anything it
replaces goes into your own ideas.

**The day, in two-hour blocks.** A block at home is getting ready (30
minutes; after the first block, a 15-minute **change-over**, like out of
the cleaning clothes and into something for the shops), then **exactly
two chores** (clean the fridge, wash the windows, deep-clean a room from
the room bank), then 15 minutes of **Devotion** (a praise act for the
lead) and 15 minutes **For {lead}** (a sonnet about your marriage, plan a
night out somewhere new, pick a date outfit). A block **out** swaps the
chores for one or two errands, each with its proof. 2 hours is a block at
home; 4 adds one out; 8 is home, out, a **free hour** (on call: the lead
can still send a demand), home again, and **welcome home** (be ready, and
the arrival routine). Time left over goes to free time. Each part has a
picker: anything from that menu section (nothing twice in a day), or
**write your own** for this scene. **Check-ins** come at the end of each
block (or every so often, or none), and the lead can send a **demand**
(a photo or a quick act, with proof) any time.

**Roleplays are asked for on their own.** **🎭 Ask for a roleplay** on the
home screen, kept apart from Select-O-Matic scenes: pick any roleplay (each
says who leads it), a day and a note. It's a nudge: the other reads all of
it, you **talk it over** in the notes on the scene, and their yes, whichever
of you it comes from, means it's on: there's nothing to build. They can
also ask for a change or say not this time. Agreed roleplays wait under
**Roleplays** on the home screen. Any scene can be talked over the same way
before it starts; the notes carry on into the scene.

**Templates, and something new each time.** A new offer starts from
your last one of its kind: its hours and who leads. **Save as a
template** keeps that shape under a name (Workday, Saturday switch…) to
set in one tap next time; never what's in it, because novelty matters.
**Fill it for me** picks things your last five scenes didn't use while
there's anything else, rooms included, and the roleplay picker puts ones
you've never played first (then ones you both love), with how often and
when the others were played. Templates are listed (and deleted) on the
Menu page.

**Switching.** Any scene can be led by whoever usually follows: choose who
leads when you offer or ask. In a switched scene everything follows the
switch (the lead's controls, demands, praise, who's notified of what), and
it uses the **switch titles** from the menu (or your names). A roleplay
says who leads it, so asking for one led by the usual follow switches the
scene.

**Roleplays** live on the Menu page: a title, who leads, where, intensity,
what to wear, the setup, the action and the aftercare. Add them one by
one, import a text file, or edit them all as text. In a roleplay scene the
card is at the top while it runs (demands are optional). A roleplay has no
inspection, scores or rewards: whoever leads it ends it straight into
aftercare (**Time for aftercare**), which starts with the roleplay's own,
and there you each say what you loved and didn't. (Roleplay scenes from
before this keep their inspection.)

**Loves and dislikes.** Each of you says how you feel about a roleplay
with one tap (❤️ Love it, 👍 It's OK, 👎 Not for me) and, if you like, a few
words: what you loved and what you didn't. Do it from the Menu before
you've tried one, in aftercare after playing it (you each see the
other's), or later in the record. They're kept in your profiles: the
roleplay list shows how each of you feels, the picker puts the ones you
both love first, one your partner said isn't for them can't be picked,
and Together lists the roleplays you both love.

**Us (profiles).** Each of you fills in your own: notes in your own words
(what you like to be called, hard and soft limits, safeword and signals,
aftercare, body notes, turn-ons and mood killers, fantasies, sizes,
favourites) and how much you like each thing, **giving and getting**, 0–5
(Never, Not my thing, Maybe, Like it, Love it, Can't wait). There's a
built-in list (for pod members only, like Ideas) and your own list, which
you can add to or import. You can read each other's; **Together** shows
where you meet (both 3 or more), what's worth talking about, and what's off
the table (a 0 from either). The lead sees the follow's limits while
building a scene.

Then:

1. **Running**: each task says what proof it needs, as many of each as the
   menu says (2 photos "before & after", 10 notes "affirmations", a voice note,
   a video). The follow sends proof and **sends for review**; the lead
   approves (with praise in one more tap), sends back (one-tap reasons like
   "Redo it, properly") or skips. Tasks with a countdown start it when
   begun. The tasks are listed block by block, the one on now marked.
   Check-ins at the end of each block, or on a schedule (missed ones tell
   the lead); pausing moves them on.
2. **The lead's quick actions**, always at the top while it runs:
   **⚡ Demand** (ready-made ones: a photo right now, redo, a correction,
   devotion; or write your own; each with its proof and a countdown that
   starts at once; **Ask for more** on a task makes one about that task),
   **✨ Praise**, and **🚗 On my way** (two taps; the follow gets a countdown,
   the arrival routine and reminders).
3. **Pause**: either of you, any time. Everything stops, the inspection and
   aftercare included. Only whoever paused can resume.
4. **Inspection** (the lead; not for a roleplay): every task that was set (demands too) with
   what was sent for it, scored 1–5 ("the rest: all 4s" for speed), then
   the overall 1–5 scorecard, notes, consequences, rewards and service,
   shared with the follow, who sees the score for each task.
5. **Aftercare**: calmer colours, a shared closing checklist, reflections
   (private if you like), and **I'm back to us** from each of you closes it.
6. **Record**: the closed scene, its scorecard, everything sent, reflections.

## The menu and Ideas

- **Ideas** is the big pool: over 300 built in, everyday ones (chores,
  service, presentation, writing, rituals, aftercare) and common kink and
  BDSM activities (self-impact, safe self-bondage, sensation, edging and
  denial, toys, positions, protocol, consequences and rewards), plus the
  pod's own ideas, imported as an *ideas pack* (Menu → Import ideas) and
  stored encrypted with the menu. Built-in ideas say `{lead}` and
  `{follow}`, which show as the pod's own titles.
- The built-in ideas are **for people in a pod only**: they live in
  `lib/ideas-data.ts`, are served by `/api/ideas` to signed-in pod members,
  and never ship in the public browser files (`npm run check:bundle`, run in
  CI after the build, fails if they do). Solo-play ideas carry their safety
  notes in their details.
- **The menu** (their Select-O-Matic) is what they've picked from Ideas, plus
  their own entries. In each section, **Ideas for …** opens the pool: tap to
  add, tap again to take out. Anything taken out of the menu that isn't in
  the pool goes into their own ideas, so nothing written is lost.
- **Scenes** are built from the menu ("More ideas for this section…" jumps to
  that section's Ideas).

Built-in ideas stay generic. **Never commit a couple's own menu or ideas**
to this repository (their names, their sheet); those come in as files in
the app.

The menu can be edited as **plain text** (Menu → Edit it all as text, or
Edit as text in one section), downloaded as text, and imported from text or
JSON. A file with only some sections replaces just those; items keep their
identity by their wording, so drafts keep their picks. The text format:

```
# Our menu
Lead: Captain Kay
Follow: Sunny

## Pacing
- 4 hours: 2 rooms, 2 play breaks, 2 praise tasks, errands — 2–3 rooms

## Rooms
- Kitchen

## Tasks: Devotion
Note: shown under the section's title
### Writing
- Daily affirmations [10 notes (affirmations) + 1 voice note (read aloud)]
- Clamps for ___ mins {mins} (10 min)
  Details go on the lines under an item, indented.
```

- `## Kind: title`: sections are Presentation (getting ready), Changeover,
  Domain (chores), Errands, Tasks (devotion), Wishes (for the lead), Play,
  Arrival, Inspection, Outcomes, Service, Aftercare.
- The Pacing lines are the lengths of day to pick from; only their hours
  matter now (the room and break counts are from before blocks).
- `[...]`: the proof, any number of photos, videos, voice notes and notes.
- `(15 min)`: a countdown that starts when the task does.
- `___` and `{mins}`: a blank filled in when it's picked, and what goes there.

An ideas pack is written the same way (sections, groups, items).

## Code

- `app/`: pages and API routes. Every route checks the session and the pod.
- `components/scene/`: the scene screens (builder, running, task, wrap-up).
- `lib/crypto.ts`: all encryption (WebCrypto; runs in the browser and tests).
- `lib/menu.ts`, `lib/menu-text.ts`, `lib/ideas.ts`, `lib/blocks.ts`,
  `lib/plan.ts`, `lib/rules.ts`: the menu, its text form, the idea pool,
  the day's blocks, plans → tasks and proof, and who may do what. Pure, with unit tests. `lib/ideas-data.ts`
  is the built-in ideas: server only (see above).
- `lib/server/`: database, sessions, storage, push, the scheduler.
- `db/migrations/`: schema `som`; same rules as the family site (never edit
  an applied migration).
- The scheduler (`lib/server/scheduler.ts`) keeps check-ins, countdowns and
  arrivals in `som.timers`, so a restart loses none. Block-end check-ins
  are minutes from the start (`checkin_at`, `checkin_base`): the server
  knows when, never what.

## Run it locally

Needs Node 22 and Postgres 16. From this folder:

```sh
npm install
export DATABASE_URL=postgres://you@localhost:5432/som   # its own database
npm run migrate
SOM_ADMIN_USERNAME=me SOM_ADMIN_PASSWORD=a-long-password npm run bootstrap
npm run dev                                              # http://localhost:3100
```

Without a bucket it stores (encrypted) files in `/tmp/som-storage`.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run check:bundle   # built-in ideas aren't in the public browser files
npm run e2e     # against a running build; see e2e/run.mjs for the settings it needs
```

The end-to-end suites run two phones through pairing, a whole scene, a
workday (offer a window, ask for a change of time and capacity, agree, no
overlaps, expiry, fill, send, start in the window, demands, praise, redo, on
my way, per-task scores), a switched roleplay (asked for on its own by the
usual lead, talked over in the notes, accepted by the usual follow, run with the roles swapped, ended
straight into aftercare with loves and dislikes from both, no inspection, scores or rewards; a
roleplay marked "not for me" can't be picked; and a request turned down),
templates and novelty (the last offer remembered, a template applied, a
fill that avoids the last scene's picks, never-played roleplays first), profiles (ratings, notes, the
other's view, Together, limits in the builder), deleting, and resilience (edits made offline
save themselves once back online, the last tap before leaving a page is kept, two phones saving the
menu never silently drop either, calling off and rescheduling from either side, nothing moving while
paused, retried notes and demands arriving once, unfinished uploads removable, an invite nobody
opened not holding up a close), a staged scene (built first, seen whole by
both before it's agreed, with what to get ready beforehand), with a stand-in push service, and
check that the database and the bucket hold nothing readable. The layout suite walks every screen on a small
phone (iPhone SE; `E2E_LAYOUT_DEVICE` for another) and checks nothing is
wider than the screen, text boxes are 16px (so iPhones don't zoom) and
buttons are big enough to tap; `E2E_SHOTS=<dir>` saves a screenshot of each.
`E2E_DEVICE` picks the phone for the other suites.

## Settings

| Variable | |
|---|---|
| `DATABASE_URL` | S-O-M's own Postgres |
| `APP_URL` | `https://som.i2w2i.com` |
| `AWS_S3_BUCKET_NAME`, `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | S-O-M's own bucket |
| `SOM_ADMIN_USERNAME`, `SOM_ADMIN_NAME`, `SOM_ADMIN_PASSWORD` | the first account (remove the password after the first deploy) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | optional; otherwise made on first use and kept in the database |

Test-only, refused in production: `PUSH_ALLOW_ANY_ENDPOINT`, `SOM_MINUTE_MS`,
`SOM_TICK_MS`.

Deploying: [../../docs/RAILWAY.md](../../docs/RAILWAY.md#s-o-m-somi2w2icom).
