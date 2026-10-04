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
| Scorecards, consequences, rewards, aftercare, reflections | A scene's stage, and when things happened |
| Photos, videos, voice notes, files (and their thumbnails, names, sizes in the file) | Encrypted file sizes, check-in times, countdown times |

- **Keys.** Each pod has one key (AES-256-GCM), kept on each phone where it
  can't be exported. A backup of it, wrapped with each person's **vault
  passphrase** (PBKDF2, 600,000 rounds), lets a new phone unlock. The
  passphrase never leaves the phone.
- **Adding a partner.** Their sign-in comes with a **key link**. The secret is
  after the `#`, which browsers never send to a server; it opens once, for
  that person only, and they then choose their own passphrase.
- **Files** get their own key each and are encrypted in 8 MiB pieces, so big
  videos upload in parts and resume. Photos are redrawn on the phone first
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

1. **Draft** (usually the follow): tap to pick from the menu, pick rooms,
   pacing, check-ins; it saves as you go. **Send** it to the lead.
2. **Start** (the lead): adjust anything, then start. The plan becomes the
   follow's tasks.
3. **Running**: each task says what proof it needs, as many of each as the
   menu says (2 photos "before & after", 10 notes "affirmations", a voice note,
   a video). The follow sends proof and **sends for review**; the lead
   approves, sends back (with a note) or skips. Tasks with a countdown start
   it when begun. Check-ins on a schedule (missed ones tell the lead). The lead
   can say **On my way** with a time; the follow gets a countdown and the
   arrival routine.
4. **Pause**: either of you, any time. Everything stops. Only whoever paused
   can resume.
5. **Inspection** (the lead): a 1–5 scorecard, notes, consequences, rewards
   and service, shared with the follow.
6. **Aftercare**: calmer colours, a shared closing checklist, reflections
   (private if you like), and **I'm back to us** from each of you closes it.
7. **Record**: the closed scene, its scorecard, everything sent, reflections.

## The menu

The app ships with a neutral starter menu. A couple's own menu is imported
in the app (**Menu → Import a menu file**) and stored encrypted. **Never
commit a real menu to this repository.**

A menu file is JSON. Sections are fixed (`presentation`, `domain`, `errands`,
`tasks`, `play`, `arrival`, `inspection`, `outcomes`, `service`, `aftercare`);
each has groups of items:

```json
{
  "name": "Our menu",
  "titles": { "lead": "Lead", "follow": "Follow" },
  "pacing": [{ "label": "4 hours", "hours": 4, "rooms": 2, "playBreaks": 2, "praise": 2, "errands": false, "note": "2–3 rooms" }],
  "rooms": ["Kitchen", "Bedroom"],
  "sections": [
    { "kind": "tasks", "groups": [{ "title": "Writing", "items": [
      { "label": "Daily affirmations", "needs": [{ "kind": "text", "count": 10, "label": "affirmations" }, { "kind": "audio", "count": 1, "label": "read aloud" }] },
      { "label": "Clamps for ___ mins", "param": "mins", "minutes": 10, "needs": [{ "kind": "photo", "count": 2 }] }
    ] }] }
  ]
}
```

- `needs`: the proof, any number of each kind (`photo`, `video`, `audio`,
  `text`), with an optional label. `"photo"` on its own means one photo.
- `param`: a blank filled in when picked (`___` in the label shows where).
- `minutes`: a countdown that starts when the task does.

## Code

- `app/`: pages and API routes. Every route checks the session and the pod.
- `components/scene/`: the scene screens (builder, running, task, wrap-up).
- `lib/crypto.ts`: all encryption (WebCrypto; runs in the browser and tests).
- `lib/menu.ts`, `lib/plan.ts`, `lib/rules.ts`: the menu, plans → tasks and
  proof, and who may do what. Pure, with unit tests.
- `lib/server/`: database, sessions, storage, push, the scheduler.
- `db/migrations/`: schema `som`; same rules as the family site (never edit
  an applied migration).
- The scheduler (`lib/server/scheduler.ts`) keeps check-ins, countdowns and
  arrivals in `som.timers`, so a restart loses none.

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
npm run e2e     # against a running build; see e2e/run.mjs for the settings it needs
```

The end-to-end suites run two phones through pairing, a whole scene and
deleting, with a stand-in push service, and check that the database and the
bucket hold nothing readable.

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
