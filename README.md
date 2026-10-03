# i2w2i

A private home for family apps at **i2w2i.com**. One sign-in, one dashboard,
and each app (Events first, Couples later) in its own part of the site and its
own Postgres schema.

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
npm test
npm run build
```
