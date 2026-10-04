#!/usr/bin/env node
// After `next build`: the built-in ideas (lib/ideas-data.ts) are for pod
// members only, served by /api/ideas. They must never end up in the public
// browser files (.next/static), where anyone could fetch them. Fails if
// any of these lines from that file shows up there.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANARIES = ['Self-bondage, done safely', 'Spank yourself ___ times per cheek', 'Kneel and kiss {lead}', 'Edge ___ times, stopping each time', 'Fill the car with fuel', 'Self-spank ___ per cheek, counting aloud', 'Lick ___ clean, on video'];
const root = join(import.meta.dirname, '..', '.next', 'static');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|txt)$/.test(f)) files.push(p);
  }
})(root);
const leaks = files.flatMap((f) => {
  const text = readFileSync(f, 'utf8');
  return CANARIES.filter((c) => text.includes(c)).map((c) => `${f.slice(root.length + 1)}: “${c}”`);
});
if (leaks.length) {
  console.error('[bundle] built-in ideas are in the public browser files:\n  ' + leaks.join('\n  '));
  console.error('[bundle] only app/api/ideas may import lib/ideas-data.ts');
  process.exit(1);
}
console.log(`[bundle] ok: ${files.length} public files, no built-in ideas in them`);
