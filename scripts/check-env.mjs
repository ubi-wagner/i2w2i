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

if (prod && !process.env.APP_DB_PASSWORD && !process.env.APP_DATABASE_URL) {
  problems.push('APP_DB_PASSWORD is not set; the server would connect as the database owner and skip row-level security');
}
const appPw = process.env.APP_DB_PASSWORD;
if (appPw && !/^[A-Za-z0-9_-]{24,128}$/.test(appPw)) problems.push('APP_DB_PASSWORD must be 24-128 letters, digits, - or _');

const secret = process.env.APP_SECRET;
if (prod && (!secret || secret.length < 32)) problems.push('APP_SECRET must be set to 32+ random characters (protects event codes)');

const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.BUCKET;
if (prod && !bucket && process.env.STORAGE_DRIVER !== 'local') {
  problems.push('No storage bucket: connect the Railway bucket (AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
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
