# Deploying on Railway

## One-time setup

1. **New project → Deploy from GitHub repo → `ubi-wagner/i2w2i`**.
   - Settings → Source: deploy branch **`main`**.
   - Railway picks up `railway.json`: Dockerfile build, healthcheck `/api/health`.
2. **Add a Postgres database** to the same project.
3. **Variables** on the app service:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
   | `APP_URL` | `https://i2w2i.com` |
   | `BOOTSTRAP_ADMIN_EMAIL` | your email |
   | `BOOTSTRAP_ADMIN_NAME` | your name |
   | `BOOTSTRAP_ADMIN_PASSWORD` | a strong password (remove after first deploy) |
   | `FAMILY_NAME` | e.g. `Wagner Family` |
   | `RESEND_API_KEY` | optional at first; see Email below |
   | `EMAIL_FROM` | `i2w2i <hello@i2w2i.com>` |

4. **Settings → Networking → Custom domain → `i2w2i.com`** (and `www.i2w2i.com`).
   The domain was bought through Railway, so DNS should be set automatically.
5. Deploy. The logs should show `[migrate] applied 001_core.sql` and
   `[bootstrap] created admin ...`. Sign in at https://i2w2i.com.

## Every deploy

`entrypoint.sh` runs migrations, re-checks the admin account, then starts the
server. A failed migration stops the boot, and Railway keeps the previous
deploy running.

## Branches

- Work lands on **`claude/main`**. CI runs typecheck, tests, migrations and build.
- Merging `claude/main` → **`main`** deploys.

## Email

Until email is configured, invites still work: the People page shows each
invite link to copy and text. To send real email:

1. Create a free account at resend.com, add the domain `i2w2i.com`, and add the
   DNS records it gives you in Railway's domain settings.
2. Set `RESEND_API_KEY`.
