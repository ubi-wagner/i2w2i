#!/usr/bin/env node
// Runs every S-O-M end-to-end suite against a running server and reports.
//   BASE_URL (default http://localhost:3100), E2E_DATABASE_URL or DATABASE_URL,
//   E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD (the bootstrap admin), LOCAL_STORAGE_DIR.
//   The server under test needs PUSH_ALLOW_ANY_ENDPOINT=1 (the suites run a
//   stand-in push service) and SOM_MINUTE_MS=1000 SOM_TICK_MS=500 (minutes
//   pass in seconds, so check-ins and countdowns can be watched).
//   node e2e/run.mjs [suite ...]
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'suites');
const wanted = process.argv.slice(2);
const suites = readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, ''))
  .filter((s) => !wanted.length || wanted.includes(s)).sort();
const results = [];
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const t = Date.now();
  const r = spawnSync(process.execPath, [join(dir, `${s}.mjs`)], { stdio: 'inherit', env: process.env });
  results.push({ s, ok: r.status === 0, secs: Math.round((Date.now() - t) / 1000) });
}
console.log('\n=== summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.s} (${r.secs}s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
