#!/usr/bin/env node
// Runs before anything else at boot. Refuses to start on settings that would
// "work" but quietly break things, or that only belong in tests.
const env = process.env;
const prod = env.NODE_ENV === 'production';
const problems = [];

if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set (on Railway: ${{SomPostgres.DATABASE_URL}}, S-O-M’s own database)');

if (!env.APP_URL) {
  if (prod) problems.push('APP_URL is not set (https://som.i2w2i.com); key links and notifications would point nowhere');
} else {
  try {
    const u = new URL(env.APP_URL);
    if (prod && u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) problems.push(`APP_URL must be https in production (got ${env.APP_URL})`);
  } catch {
    problems.push(`APP_URL is not a valid URL (got ${env.APP_URL})`);
  }
}

const bucket = env.AWS_S3_BUCKET_NAME || env.AWS_S3_BUCKET || env.BUCKET;
if (prod && !bucket && env.STORAGE_DRIVER !== 'local') {
  problems.push('No storage bucket: connect S-O-M’s own Railway bucket (AWS_S3_BUCKET_NAME, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
}
if (prod && bucket && env.STORAGE_DRIVER !== 'local') {
  // A bucket name alone isn't enough: uploads would fail mid-scene instead of at boot.
  if (!(env.AWS_ENDPOINT_URL || env.ENDPOINT)) problems.push('The bucket has no endpoint: set AWS_ENDPOINT_URL (or ENDPOINT) from S-O-M’s Railway bucket');
  if (!(env.AWS_ACCESS_KEY_ID || env.ACCESS_KEY_ID) || !(env.AWS_SECRET_ACCESS_KEY || env.SECRET_ACCESS_KEY)) problems.push('The bucket has no keys: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from S-O-M’s Railway bucket');
}
if (prod && (env.STORAGE_DRIVER === 'local' || !bucket) && (!env.APP_SECRET || env.APP_SECRET.length < 32)) {
  problems.push('Local storage signs its upload links with APP_SECRET: set 32+ random characters');
}

// Test-only switches: they'd weaken notifications or make minutes into seconds.
if (prod && env.PUSH_ALLOW_ANY_ENDPOINT === '1') problems.push('PUSH_ALLOW_ANY_ENDPOINT is for tests only; remove it');
if (prod && (env.SOM_MINUTE_MS || env.SOM_TICK_MS)) problems.push('SOM_MINUTE_MS / SOM_TICK_MS are for tests only; remove them');

if (env.SOM_ADMIN_PASSWORD && env.SOM_ADMIN_PASSWORD.length < 10) problems.push('SOM_ADMIN_PASSWORD must be at least 10 characters');
if (env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY) problems.push('VAPID_PUBLIC_KEY is set without VAPID_PRIVATE_KEY (set both or neither)');

if (problems.length) {
  for (const p of problems) console.error(`[env] ${p}`);
  console.error('[env] refusing to start; fix the variables above on the S-O-M service');
  process.exit(1);
}
console.log('[env] ok');
