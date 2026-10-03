# Deploying on Railway

## How a deploy works

```
claude/main ──PR──▶ main ──(CI green)──▶ Railway builds Dockerfile ──▶ entrypoint.sh
                                                                     1. check env vars
                                                                     2. migrate (locked)
                                                                     3. ensure admin exists
                                                                     4. start server
                                                     healthcheck /api/health ──▶ traffic switches
```

- Claude pushes to **`claude/main`** only. CI runs there.
- Eric opens a PR `claude/main` → `main` and merges once CI is green.
- Railway deploys **`main`**. If any boot step fails, the healthcheck never passes,
  the new deploy is marked failed and **the previous deploy keeps serving**.

CI (`.github/workflows/ci.yml`) has two jobs:

| Job | What it proves |
|---|---|
| `check` | typecheck, unit tests, migrations apply and are idempotent, bootstrap is idempotent, `next build` |
| `image` | the exact Dockerfile Railway uses builds; it refuses to boot without `APP_URL`; it boots, migrates, serves `/login` and `/api/health`; a restart is a no-op |

## One-time setup (in this order)

1. **Merge to `main` first.** Open a PR from `claude/main` to `main` on GitHub and merge it.
   (Railway would fail to build the README-only `main`.)

2. **Create the project with the database first**, so the first app deploy
   has everything it needs:
   - Railway → **New Project → Empty Project**.
   - **Add → Database → PostgreSQL**.
   - Postgres service → **Backups**: turn on scheduled backups.

3. **Add the app service:** **Add → GitHub Repo → `ubi-wagner/i2w2i`**.
   Authorize Railway's GitHub app for the repo if asked.

4. **App service → Settings:**
   - **Source → Branch:** `main`.
   - **Source → Wait for CI:** **on**. Railway then deploys a commit only after
     its GitHub checks pass.
   - Builder and healthcheck come from `railway.json`; leave them as is.
   - Don't set a custom start command; the Dockerfile's entrypoint does the work.

5. **App service → Variables:**

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable; uses the private network) |
   | `APP_URL` | `https://i2w2i.com` (must be https; the app refuses to start otherwise) |
   | `BOOTSTRAP_ADMIN_EMAIL` | your email |
   | `BOOTSTRAP_ADMIN_NAME` | your name |
   | `BOOTSTRAP_ADMIN_PASSWORD` | 10+ characters; **delete after the first successful deploy** |
   | `FAMILY_NAME` | e.g. `Wagner Family` |
   | `EMAIL_FROM` | `i2w2i <hello@i2w2i.com>` |
   | `RESEND_API_KEY` | later; see Email |
   | Bucket, `APP_DB_PASSWORD`, `APP_SECRET` | see “Before merging the Events release” |

   Don't set `PORT`: Railway provides it and the server uses it.

6. **Deploy** (Railway deploys when variables change, or press Deploy).
   The deploy logs should read:

   ```
   [entrypoint] listening on :: port 8080
   [env] ok
   [migrate] applied 001_core.sql … 004_activity.sql
   [db-role] server connects as i2w2i_app
   [bootstrap] created admin you@...
   [bootstrap] admin password set ...
   ✓ Ready
   ```

7. **App service → Settings → Networking → Custom Domain:** add `i2w2i.com`
   and `www.i2w2i.com`. The domain was bought through Railway, so DNS should
   be configured for you; wait for the certificate to show as issued.

8. Sign in at https://i2w2i.com with the password, then **delete
   `BOOTSTRAP_ADMIN_PASSWORD`** from the variables.

## Before merging the Events release (one time)

The Events release adds a storage bucket, a restricted database role and an
app secret. **Set these up before merging**; if you merge first, the new
deploy refuses to start (with a clear `[env]` message) and the current one
keeps serving.

1. **Add the bucket:** in the project, **Add → Bucket**. Note its name
   (e.g. `Bucket`).
2. **App service → Variables**, add:

   | Variable | Value |
   |---|---|
   | `AWS_S3_BUCKET_NAME` | `${{Bucket.BUCKET}}` |
   | `AWS_ENDPOINT_URL` | `${{Bucket.ENDPOINT}}` |
   | `AWS_ACCESS_KEY_ID` | `${{Bucket.ACCESS_KEY_ID}}` |
   | `AWS_SECRET_ACCESS_KEY` | `${{Bucket.SECRET_ACCESS_KEY}}` |
   | `AWS_DEFAULT_REGION` | `${{Bucket.REGION}}` |
   | `APP_DB_PASSWORD` | 40 random letters and digits (password manager); no symbols other than `-` `_` |
   | `APP_SECRET` | another 40+ random letters and digits. **Never change it**: it backs every QR card and code |

   (Replace `Bucket` with your bucket's name if different; typing `${{` in
   Railway's editor offers the right names.) Keep `DATABASE_URL` as it is.
3. Merge `claude/main` → `main`. The deploy log should show:

   ```
   [env] ok
   [migrate] applied 002_app_role.sql
   [migrate] applied 003_events.sql
   [migrate] applied 004_activity.sql
   [migrate] i2w2i_app can log in
   [db-role] server connects as i2w2i_app
   [storage] bucket CORS allows uploads from https://i2w2i.com, https://www.i2w2i.com
   ```

   If the `[storage]` line is a WARNING instead, phone uploads won't work
   yet; send Claude the log.

## Downloading an album

Each photo has "Download original" on the manage page. For everything at
once, use the bucket credentials (Railway → Bucket → Credentials) with
[rclone](https://rclone.org) or the AWS CLI:

```sh
aws s3 sync "s3://<BUCKET>/events/<event id>/" ./album --endpoint-url "<ENDPOINT>"
```

The event id is in the manage page's address.

## GitHub settings (recommended)

Settings → Branches → **Add branch ruleset** for `main`:
- Require a pull request before merging.
- Require status checks to pass: **`check`** and **`image`**.

Then nothing reaches Railway without passing CI, even by accident.

## Migrations

- Add `db/migrations/NNN_name.sql` (next number). They run on every boot,
  in order, each in its own transaction, under a Postgres advisory lock (so
  overlapping old/new containers can't both apply one).
- Never edit an applied migration; the runner stops the boot if a checksum
  changed. Fix forward with a new file.
- To see what's pending against any database: `DATABASE_URL=... npm run migrate:check`.

## Email

Until email is configured, invites still work: the People page shows each
invite link to copy and text. To send real email:

1. Create an account at resend.com and add the domain `i2w2i.com`.
2. Add the DNS records Resend gives you under the domain in Railway.
3. Set `RESEND_API_KEY` on the app service.

## When a deploy fails

Open the failed deploy's logs in Railway; the first `[env]`, `[migrate]` or
`[bootstrap]` error line says what's wrong. The previous deploy is still live.
