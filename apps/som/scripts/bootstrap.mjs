#!/usr/bin/env node
// Idempotent first-run setup: makes sure the admin account exists.
//
//   SOM_ADMIN_USERNAME   required to do anything
//   SOM_ADMIN_NAME       default: the username
//   SOM_ADMIN_PASSWORD   optional; set only if the account has no password yet
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const username = process.env.SOM_ADMIN_USERNAME?.trim().toLowerCase();
if (!username) {
  console.log('[bootstrap] SOM_ADMIN_USERNAME not set; skipping');
  process.exit(0);
}
if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
  console.error('[bootstrap] SOM_ADMIN_USERNAME must be 2-32 of a-z 0-9 . _ -');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  let [a] = await sql`SELECT id, password_hash FROM som.accounts WHERE username = ${username}`;
  if (!a) {
    [a] = await sql`INSERT INTO som.accounts (username, display_name, is_admin)
                    VALUES (${username}, ${process.env.SOM_ADMIN_NAME || username}, true) RETURNING id, password_hash`;
    console.log(`[bootstrap] created admin ${username}`);
  } else {
    await sql`UPDATE som.accounts SET is_admin = true, is_active = true WHERE id = ${a.id}`;
  }
  const pw = process.env.SOM_ADMIN_PASSWORD;
  if (pw && !a.password_hash) {
    if (pw.length < 10) throw new Error('SOM_ADMIN_PASSWORD must be at least 10 characters');
    await sql`UPDATE som.accounts SET password_hash = ${await bcrypt.hash(pw, 12)} WHERE id = ${a.id}`;
    console.log('[bootstrap] admin password set (you can now remove SOM_ADMIN_PASSWORD)');
  }
} catch (err) {
  console.error('[bootstrap] failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
