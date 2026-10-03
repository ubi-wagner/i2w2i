#!/usr/bin/env node
// Runs before anything else at boot. Refuses to start on settings that would
// "work" but quietly break things (e.g. invite links pointing at localhost).
const prod = process.env.NODE_ENV === 'production';
const problems = [];
const warnings = [];

if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is not set (on Railway: ${{Postgres.DATABASE_URL}})');

const appUrl = process.env.APP_URL;
if (!appUrl) {
  (prod ? problems : warnings).push('APP_URL is not set; emailed links would point at localhost');
} else {
  try {
    const u = new URL(appUrl);
    if (prod && u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) {
      problems.push(`APP_URL must be https in production (got ${appUrl})`);
    }
  } catch {
    problems.push(`APP_URL is not a valid URL (got ${appUrl})`);
  }
}

if (process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 10) {
  problems.push('BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters');
}
if (!process.env.RESEND_API_KEY) warnings.push('RESEND_API_KEY is not set; invite links are shown on the People page instead of emailed');

for (const w of warnings) console.warn(`[env] note: ${w}`);
if (problems.length) {
  for (const p of problems) console.error(`[env] ${p}`);
  console.error('[env] refusing to start; fix the variables above on the Railway service');
  process.exit(1);
}
console.log('[env] ok');
