#!/usr/bin/env node
// Idempotent first-run setup: makes sure the family and the admin exist.
//
//   BOOTSTRAP_ADMIN_EMAIL     required to do anything
//   BOOTSTRAP_ADMIN_NAME      default "Admin"
//   BOOTSTRAP_ADMIN_PASSWORD  optional; set only if the admin has no password yet
//   FAMILY_NAME               default "Our Family"
//
// Pass --link to print a one-time sign-in link (local use; don't do this in prod logs).
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { ownerDatabaseUrl } from '../db/urls.mjs';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
if (!email) {
  console.log('[bootstrap] BOOTSTRAP_ADMIN_EMAIL not set; skipping');
  process.exit(0);
}
const url = ownerDatabaseUrl();
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const familyName = process.env.FAMILY_NAME || 'Our Family';
  await sql`INSERT INTO core.families (slug, name)
            SELECT 'family', ${familyName} WHERE NOT EXISTS (SELECT 1 FROM core.families)`;

  let [user] = await sql`SELECT id, password_hash FROM core.users WHERE email = ${email}`;
  if (!user) {
    [user] = await sql`INSERT INTO core.users (email, display_name, platform_role)
                       VALUES (${email}, ${process.env.BOOTSTRAP_ADMIN_NAME || 'Admin'}, 'admin')
                       RETURNING id, password_hash`;
    console.log(`[bootstrap] created admin ${email}`);
  } else {
    await sql`UPDATE core.users SET platform_role = 'admin', is_active = true WHERE id = ${user.id}`;
  }
  await sql`INSERT INTO core.family_members (family_id, user_id)
            SELECT id, ${user.id} FROM core.families ON CONFLICT DO NOTHING`;
  // Owner of every non-sensitive app. Sensitive apps are granted by hand, never by role.
  await sql`INSERT INTO core.user_app_roles (user_id, app_key, role)
            SELECT ${user.id}, key, 'owner' FROM core.apps WHERE NOT sensitive
            ON CONFLICT DO NOTHING`;

  const pw = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (pw && !user.password_hash) {
    if (pw.length < 10) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters');
    await sql`UPDATE core.users SET password_hash = ${await bcrypt.hash(pw, 12)} WHERE id = ${user.id}`;
    console.log('[bootstrap] admin password set (you can now remove BOOTSTRAP_ADMIN_PASSWORD)');
  }

  if (process.argv.includes('--link')) {
    const token = randomBytes(32).toString('base64url');
    await sql`INSERT INTO core.login_tokens (user_id, token_hash, purpose, expires_at)
              VALUES (${user.id}, ${createHash('sha256').update(token).digest()}, 'login', now() + interval '20 minutes')`;
    const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    console.log(`[bootstrap] sign-in link: ${base}/auth/link?token=${token}`);
  }
} catch (err) {
  console.error('[bootstrap] failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
