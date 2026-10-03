#!/usr/bin/env node
// Applies db/migrations/NNN_name.sql in order, each in its own transaction,
// and records a sha256 per file. An applied migration is never edited: if a
// recorded checksum no longer matches the file, the run stops. Fix forward
// with a new file.
//
//   node db/migrate.mjs           apply pending migrations
//   node db/migrate.mjs --check   report pending/drifted, apply nothing (exit 1 if any)
//
// Connects with DATABASE_URL_OWNER if set, else DATABASE_URL.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const url = process.env.DATABASE_URL_OWNER || process.env.DATABASE_URL;
const checkOnly = process.argv.includes('--check');

if (!url) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name       text PRIMARY KEY,
    sha256     text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const files = (await readdir(dir)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const applied = new Map((await sql`SELECT name, sha256 FROM public.schema_migrations`).map((r) => [r.name, r.sha256]));

  const drifted = [];
  const pending = [];
  for (const name of files) {
    const body = await readFile(join(dir, name), 'utf8');
    const sha = createHash('sha256').update(body).digest('hex');
    if (!applied.has(name)) pending.push({ name, body, sha });
    else if (applied.get(name) !== sha) drifted.push(name);
  }

  if (drifted.length) {
    console.error(`[migrate] applied migrations were edited: ${drifted.join(', ')}. Restore them and add a new migration instead.`);
    process.exitCode = 1;
    return;
  }
  if (checkOnly) {
    console.log(pending.length ? `[migrate] pending: ${pending.map((p) => p.name).join(', ')}` : '[migrate] up to date');
    if (pending.length) process.exitCode = 1;
    return;
  }
  for (const m of pending) {
    await sql.begin(async (tx) => {
      await tx.unsafe(m.body);
      await tx`INSERT INTO public.schema_migrations (name, sha256) VALUES (${m.name}, ${m.sha})`;
    });
    console.log(`[migrate] applied ${m.name}`);
  }
  if (!pending.length) console.log('[migrate] up to date');
}

main()
  .catch((err) => {
    console.error('[migrate] failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
