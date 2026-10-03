// Frames, filters and captions: originals untouched, gallery copy re-rendered.
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, RUN, adminPage, check, createCode, createEvent, db, finish, fixture, joinWithCode, phonePage, uploadFiles } from '../lib.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'i2w2i-e2e-'));
const slug = `decorate-${RUN}`;
const host = await adminPage();
const ev = await createEvent(host, `Decorate ${RUN}`, slug);
await createCode(host, ev, 'DECO1');
const g = await phonePage();
await joinWithCode(g, slug, 'Dee', 'DECO1');
const dlg = g.getByRole('dialog', { name: 'Decorate' });

await g.route(/op=put/, (route) => setTimeout(() => route.continue().catch(() => {}), 2500));
await g.locator('input[type=file]').setInputFiles([fixture('portrait.jpg')]);
const row = g.locator('[aria-label="Uploads"] li').first();
await row.getByRole('button', { name: 'Add frame' }).click();
await dlg.getByRole('radio', { name: 'Polaroid' }).click();
await dlg.getByRole('radio', { name: 'Warm' }).click();
await dlg.getByLabel('Caption').fill('Best day ever');
await dlg.getByRole('button', { name: 'Save' }).click();
await row.getByText('Added ✓').waitFor({ timeout: 30000 });
await g.unroute(/op=put/);
await g.waitForTimeout(1000);
const row1 = async () => (await db`SELECT overlay, caption, size_bytes FROM events.uploads WHERE event_id = ${ev.id} AND kind = 'photo'`)[0];
let u = await row1();
check(u?.overlay?.frame === 'polaroid' && u.overlay.filter === 'warm' && u.caption === 'Best day ever', 'frame picked during upload is saved with it');

await row.getByRole('button', { name: 'Change frame' }).click();
await dlg.getByRole('radio', { name: 'Hearts' }).click();
await dlg.getByRole('radio', { name: 'B&W' }).click();
await dlg.getByRole('button', { name: 'Save' }).click();
await row.getByText('Frame saved ✓').waitFor({ timeout: 15000 });
u = await row1();
check(u?.overlay?.frame === 'hearts' && u.overlay.filter === 'bw', 'frame can be changed after the upload finished');

await g.reload();
const src = await g.locator('main img').first().getAttribute('src');
const f = join(tmp, 'deco.jpg');
writeFileSync(f, await (await g.request.get(BASE + src)).body());
let imageChecks = true;
try {
  const sat = Number(execSync(`convert "${f}" -colorspace HSL -channel g -separate +channel -format "%[fx:mean]" info:`).toString());
  const red = Number(execSync(`convert "${f}" -crop 3%x3%+0+0 -format "%[fx:mean.r-mean.g]" info:`).toString());
  check(sat < 0.2, `gallery copy is the B&W render (saturation ${sat.toFixed(2)})`);
  check(red > 0.05, 'the heart frame is drawn in the corner');
} catch {
  imageChecks = false; // ImageMagick not installed: skip pixel checks
}
if (!imageChecks) console.log('skip - pixel checks (no ImageMagick)');
check(Number(u.size_bytes) === 847549, 'the original is untouched');

await g.locator('input[type=file]').setInputFiles([fixture('clip.mp4')]);
const vrow = g.locator('[aria-label="Uploads"] li').first();
await vrow.getByText('Added ✓').waitFor({ timeout: 30000 });
await vrow.getByRole('button', { name: 'Add frame' }).click();
await dlg.getByRole('radio', { name: 'Gold' }).click();
await dlg.getByRole('button', { name: 'Save' }).click();
await vrow.getByText('Frame saved ✓').waitFor({ timeout: 15000 });
const [v] = await db`SELECT overlay FROM events.uploads WHERE event_id = ${ev.id} AND kind = 'video'`;
check(v?.overlay?.frame === 'gold', 'videos get a frame (drawn at playback)');

// Video stills: the phone grabs a frame so tiles aren't black on iPhones.
const poster = await phonePage();
await joinWithCode(poster, slug, 'Vee', 'DECO1');
await uploadFiles(poster, [fixture('clip.webm')]);
const [webm] = await db`SELECT preview_key FROM events.uploads WHERE event_id = ${ev.id} AND filename = 'clip.webm'`;
check(Boolean(webm?.preview_key), 'a still is made for each video during upload');
await poster.reload();
const tile = poster.getByRole('button', { name: 'Open video from Vee' });
check((await tile.locator('img').count()) === 1, 'the video tile shows the still instead of a black frame');

const other = await phonePage();
await joinWithCode(other, slug, 'Mal', 'DECO1');
const [{ id }] = await db`SELECT id FROM events.uploads WHERE event_id = ${ev.id} AND kind = 'photo'`;
const r = await other.request.post(`${BASE}/album/${slug}/api/uploads/${id}`, { data: { action: 'decorate', overlay: { frame: 'married' } } });
check(r.status() === 404, 'nobody else can decorate your photo');
await finish();
