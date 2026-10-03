# i2w2i

A private home for family apps at **i2w2i.com**. One sign-in, one dashboard,
and each app (Events first, Couples later) in its own part of the site and its
own Postgres schema.

**Events** (first app): albums for family occasions.

- **Guests:** join by QR card or typed code, with no account or install, and upload photos and videos from any phone. Uploads resume after app switches, reloads and dropped connections.
- **Accounts:** family members sign in with email and password; invitees chat in the event's group chat.
- **Hosts:**
  - publish to invitees, the whole family, or the public;
  - curate in bulk;
  - download selections as zips;
  - see who uploaded what, from which device.
- **Extras:** comments, frames and filters (originals untouched), and gift/Venmo links with QR codes.

- How it fits together and who can do what: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Deploying on Railway: [docs/RAILWAY.md](docs/RAILWAY.md)
- Conventions for working in this repo: [CLAUDE.md](CLAUDE.md)

## Run it locally

Needs Node 22 and Postgres 16.

```sh
cp .env.example .env.local        # fill in DATABASE_URL and BOOTSTRAP_ADMIN_*
npm install
npm run migrate
npm run bootstrap-admin
npm run dev                       # http://localhost:3000
```

Without `RESEND_API_KEY`, sign-in and invite emails are printed to the console
and the admin page shows invite links so you can send them yourself.

## Checks

```sh
npm run typecheck
npm test            # unit + row-level security (needs DATABASE_URL and APP_DB_PASSWORD)
npm run build
npm run e2e         # browser suites against a running build; see e2e/run.mjs
```
