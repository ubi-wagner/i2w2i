// Uploads that survive real-world interruptions: page reloads, going
// offline, silent stalls, and a browser that couldn't keep the file.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BASE, RUN, adminPage, check, createCode, createEvent, db, finish, fixture, joinWithCode, phonePage, sha, storedSha } from '../lib.mjs';

const BIG = randomBytes(40 * 1024 * 1024 + 12345); // 6 parts of 8 MB
const PARTS = Math.ceil(BIG.length / (8 * 1024 * 1024));
const bigSha = sha(BIG);
const slug = `uploads-${RUN}`;
const host = await adminPage();
const ev = await createEvent(host, `Uploads ${RUN}`, slug);
await createCode(host, ev, 'RESUME1');

async function guest(name) {
  const p = await phonePage('pixel');
  await joinWithCode(p, slug, name, 'RESUME1');
  const parts = { ok: 0 };
  p.on('response', (r) => { if (r.url().includes('op=part') && r.status() === 200) parts.ok++; });
  return { p, parts };
}
const waitParts = async (parts, n) => { const t = Date.now(); while (parts.ok < n) { if (Date.now() - t > 90000) throw new Error('parts timeout'); await new Promise((r) => setTimeout(r, 100)); } };
const added = (p) => p.getByText('Added ✓').first().waitFor({ timeout: 180000 });
const file = (name) => ({ name, mimeType: 'video/mp4', buffer: BIG });
const slow = (p) => p.route(/op=part/, (route) => setTimeout(() => route.continue().catch(() => {}), 1500));

{ // Reload mid-upload: picks up by itself from the stored parts
  const { p, parts } = await guest('Rita');
  await slow(p);
  await p.locator('input[type=file]').setInputFiles(file('rita.mp4'));
  await waitParts(parts, 2);
  await p.unroute(/op=part/);
  await p.reload();
  await added(p);
  check(parts.ok <= PARTS, `reload: resumed by itself, no part sent twice (${parts.ok} for ${PARTS})`);
  check((await storedSha('rita.mp4', 'Rita')) === bigSha, 'reload: stored video is byte-identical');
}
{ // Offline mid-upload: waits, then continues
  const { p, parts } = await guest('Olly');
  await p.locator('input[type=file]').setInputFiles(file('olly.mp4'));
  await waitParts(parts, 1);
  await p.context().setOffline(true);
  await p.waitForTimeout(4000);
  check(!(await p.getByText('Added ✓').isVisible()), 'offline: the upload waits');
  await p.context().setOffline(false);
  await added(p);
  check(parts.ok === PARTS, `offline: continued when back online, each part once (${parts.ok} of ${PARTS})`);
  check((await storedSha('olly.mp4', 'Olly')) === bigSha, 'offline: stored video is byte-identical');
}
{ // A part hangs with no error: detected and retried
  const { p } = await guest('Sam');
  let hung = false;
  await p.route(/op=part/, async (route) => { if (!hung && /[?&]n=3(&|$)/.test(route.request().url())) { hung = true; return; } await route.continue(); });
  const t0 = Date.now();
  await p.locator('input[type=file]').setInputFiles(file('sam.mp4'));
  await added(p);
  check(hung && Date.now() - t0 < 80000, `stall: detected and retried automatically (${Math.round((Date.now() - t0) / 1000)}s)`);
  check((await storedSha('sam.mp4', 'Sam')) === bigSha, 'stall: stored video is byte-identical');
}
{ // The browser couldn't keep the file: asks for it by name, resumes on re-pick
  const { p, parts } = await guest('Ria');
  await slow(p);
  await p.locator('input[type=file]').setInputFiles(file('ria.mp4'));
  await waitParts(parts, 2);
  await p.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('i2w2i-uploads');
    req.onsuccess = () => {
      const t = req.result.transaction('uploads', 'readwrite');
      const s = t.objectStore('uploads');
      s.getAll().onsuccess = (e) => { for (const r of e.target.result) { delete r.file; s.put(r); } };
      t.oncomplete = resolve;
    };
  }));
  await p.unroute(/op=part/);
  await p.reload();
  await p.getByText('Choose this file again').waitFor();
  check(await p.getByText(/interrupted.*ria\.mp4/).isVisible(), 're-pick: the page names the file it needs');
  const before = parts.ok;
  await p.locator('input[type=file]').setInputFiles(file('ria.mp4'));
  await added(p);
  check(parts.ok - before > 0 && parts.ok - before < PARTS && parts.ok <= PARTS, `re-pick: only the missing parts were sent (${parts.ok - before})`);
  check((await storedSha('ria.mp4', 'Ria')) === bigSha, 're-pick: stored video is byte-identical');
  const [{ n }] = await db`SELECT count(*)::int AS n FROM events.uploads WHERE filename = 'ria.mp4' AND uploader_name = 'Ria' AND event_id = ${ev.id}`;
  check(n === 1, 're-pick: no duplicate upload');
}
{ // Two "complete"s at once (a resumed page and the one it replaced, or a retry): one finishes, the other waits and finds it done
  const { p } = await guest('Duo');
  let second = null;
  await p.route(/\/api\/uploads\/[0-9a-f-]{36}$/, async (route) => {
    const body = route.request().postData() ?? '';
    if (!second && body.includes('"complete"')) {
      second = p.evaluate(([url, b]) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b }).then((r) => r.status), [route.request().url(), body]);
    }
    await route.continue();
  });
  await p.locator('input[type=file]').setInputFiles(file('duo.mp4'));
  await added(p);
  check(second && (await second) === 200, 'two completions at once: both succeed');
  check((await storedSha('duo.mp4', 'Duo')) === bigSha, 'two completions at once: stored video is byte-identical');
}
{ // Two finishing at the same moment: the next waiting file still starts (two go at a time)
  const { p } = await guest('Trio');
  let release;
  const gate = new Promise((r) => { release = r; });
  let held = 0;
  await p.route(/\/api\/uploads\/[0-9a-f-]{36}$/, async (route) => {
    if ((route.request().postData() ?? '').includes('"complete"') && held < 2) {
      if (++held === 2) release();
      await gate;
    }
    await route.continue();
  });
  const photo = readFileSync(fixture('landscape-gps.jpg'));
  await p.locator('input[type=file]').setInputFiles([1, 2, 3].map((i) => ({ name: `trio${i}.jpg`, mimeType: 'image/jpeg', buffer: photo })));
  const done = await p.waitForFunction(
    () => [...document.querySelectorAll('[aria-label="Uploads"] li')].filter((l) => l.textContent.includes('Added ✓')).length === 3,
    null, { timeout: 30000 },
  ).then(() => true, () => false);
  check(held === 2 && done, 'two uploads finishing together don’t leave the third one waiting');
}
{ // Too big, wrong type: refused before anything is sent
  const { p } = await guest('Big Ben');
  await p.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  check(await p.getByText('Only photos and videos can be added.').isVisible(), 'non-media files are refused in the browser');
  const r = await p.request.post(`${BASE}/album/${slug}/api/uploads`, { data: { name: 'huge.mov', type: 'video/quicktime', size: 3 * 1024 ** 3 } });
  check(r.status() === 400, 'the server refuses files over 2 GB');
}
await finish();
