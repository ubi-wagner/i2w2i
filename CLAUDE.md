# i2w2i: working notes

Family app platform on Railway. Read `docs/ARCHITECTURE.md` first.

## Branches and deploy
- Work on `claude/main`. Eric merges `claude/main` → `main`; `main` deploys to Railway.
- Before pushing: `npm run typecheck && npm test && npm run build`.

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
