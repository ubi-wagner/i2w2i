// Deleting: you can delete what you sent any time (from the bucket too);
// a whole scene goes only when both agree; an unsent draft is its author's.
// And when both say yes at the same moment (to deleting, or to being back
// to "us"), both count.
import { randomUUID } from 'node:crypto';
import { BASE, bucketObjects, call, check, db, finish, newPod, png, runningScene, TITLES } from '../lib.mjs';

const { b, r, podId } = await newPod();
const sheet = (p) => p.locator('dialog[open]').last();

// ── An unsent draft is just its author's ────────────────────────────────────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const draft = b.url().split('/').pop();
await r.goto(`${BASE}/scene/${draft}`);
await r.getByRole('button', { name: 'Delete this scene…' }).waitFor();
check(true, 'the partner can only ask to delete someone else’s draft');
await b.getByRole('button', { name: 'Delete this draft' }).click();
await b.getByRole('button', { name: 'Delete it' }).click();
await b.waitForURL(`${BASE}/`);
check((await db`SELECT 1 FROM som.scenes WHERE id = ${draft}`).length === 0, 'the author deletes their own unsent draft alone');

// ── What you send is yours to delete ────────────────────────────────────────
const id = await runningScene(b, r, { title: 'Delete test', picks: [[1, 'Chores', 'Laundry: wash']], checkin: '120' });
await b.goto(`${BASE}/scene/${id}`);
await b.getByRole('button', { name: /Laundry: wash/ }).click();
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'FLOWERS', '#c37')]);
await sheet(b).getByText('1/1 photo').waitFor({ timeout: 30000 });
const [photo] = await db`SELECT id, object_key, thumb_key FROM som.media WHERE scene_id = ${id}`;
const objs = bucketObjects(`s/${id}`);
check(objs.length === 2, `a photo is two objects in the bucket, the file and its thumbnail (${objs.map((f) => f.split('/').pop()).join(', ')})`);
const notMine = await call(r, `/api/media/${photo.id}`, 'DELETE');
check(notMine.status === 403, 'the partner can’t delete it');
await sheet(b).getByRole('button', { name: 'Open photo' }).click();
await sheet(b).getByRole('button', { name: 'Delete' }).click();
await sheet(b).getByText('0/1 photo').waitFor({ timeout: 10000 });
check((await db`SELECT 1 FROM som.media WHERE id = ${photo.id}`).length === 0 && bucketObjects(`s/${id}`).length === 0, 'the sender deletes it: gone from the database and the bucket');

// A note with a photo attached: deleting the note takes the photo too.
await sheet(b).getByRole('button', { name: 'Close' }).first().click();
await b.locator('#checkin').getByRole('button', { name: 'Check in' }).click();
await b.getByLabel('Check-in note').fill('On the way to the florist');
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'SHOP', '#3a7')]);
await b.getByRole('button', { name: 'Send check-in' }).click();
await b.locator('#notes').getByRole('button', { name: 'Open photo' }).waitFor({ timeout: 30000 });
const [entry] = await db`SELECT id FROM som.entries WHERE scene_id = ${id} AND kind = 'checkin'`;
const notTheirs = await call(r, `/api/entries/${entry.id}`, 'DELETE');
check(notTheirs.status === 403, 'the partner can’t delete Sunny’s check-in');
await b.locator('#notes').getByRole('button', { name: 'Delete' }).click();
await b.locator('#notes').getByText('On the way to the florist').waitFor({ state: 'detached' });
check((await db`SELECT 1 FROM som.media WHERE scene_id = ${id}`).length === 0 && bucketObjects(`s/${id}`).length === 0, 'deleting a check-in deletes the photo sent with it, from the bucket too');

// ── A whole scene: both agree, either can change their mind ─────────────────
await b.locator('#notes').getByRole('textbox').fill('one more note');
await b.locator('#notes').getByRole('button', { name: 'Send note' }).click();
await sheet(b).waitFor({ state: 'detached' }).catch(() => {});
await r.goto(`${BASE}/scene/${id}`);
await r.getByRole('button', { name: 'Delete this scene…' }).click();
await r.getByText(`${TITLES.follow} has to agree too`).waitFor();
await r.getByRole('button', { name: 'Ask to delete' }).click();
await r.getByText('You asked to delete this scene').waitFor();
await b.reload();
await b.getByText('would like to delete this scene').waitFor();
check(true, 'asking shows the request on the other phone; nothing is deleted yet');
await r.getByRole('button', { name: 'Take it back' }).click();
// Once it's taken back Kay's screen offers to delete again; only then look on Sunny's.
await r.getByRole('button', { name: 'Delete this scene…' }).waitFor();
await b.reload();
await b.getByText('Your tasks').waitFor();
check((await b.getByText('would like to delete this scene').count()) === 0, 'taking it back withdraws the request');
await r.getByRole('button', { name: 'Delete this scene…' }).click();
await r.getByRole('button', { name: 'Ask to delete' }).click();
await r.getByText('You asked to delete this scene').waitFor();
await b.reload();
await b.getByRole('button', { name: 'Agree and delete' }).click();
await b.waitForURL(`${BASE}/`);
const left = await db`SELECT (SELECT count(*) FROM som.scenes WHERE id = ${id})::int AS s, (SELECT count(*) FROM som.entries WHERE scene_id = ${id})::int AS e, (SELECT count(*) FROM som.tasks WHERE scene_id = ${id})::int AS t`;
check(left[0].s === 0 && left[0].e === 0 && left[0].t === 0, 'when both agree the scene goes, with its tasks and notes');
const gone = await call(r, `/api/scenes/${id}`);
check(gone.status === 404, '…for both of them');

// ── Both at the same moment ─────────────────────────────────────────────────
// Scenes made straight through the API (contents are never opened here).
const cipher = () => `j1.${randomUUID().replace(/-/g, '')}.${randomUUID().replace(/-/g, '')}`;
async function sceneIn(status) {
  const sid = randomUUID();
  await call(b, `/api/pods/${podId}/scenes`, 'POST', { id: sid, planEnc: cipher() });
  await call(b, `/api/scenes/${sid}/action`, 'POST', { action: 'propose' });
  if (status === 'proposed') return sid;
  await call(r, `/api/scenes/${sid}/action`, 'POST', { action: 'start', tasks: [{ id: randomUUID(), ord: 0, bodyEnc: cipher() }] });
  await call(r, `/api/scenes/${sid}/action`, 'POST', { action: 'inspect' });
  await call(r, `/api/scenes/${sid}/action`, 'POST', { action: 'aftercare' });
  return sid;
}
let deletedTogether = 0;
let closedTogether = 0;
for (let i = 0; i < 6; i++) {
  const d = await sceneIn('proposed');
  await Promise.all([call(b, `/api/scenes/${d}/delete`, 'POST', { agree: true }), call(r, `/api/scenes/${d}/delete`, 'POST', { agree: true })]);
  if (!(await db`SELECT 1 FROM som.scenes WHERE id = ${d}`).length) deletedTogether++;
  const c = await sceneIn('aftercare');
  await Promise.all([call(b, `/api/scenes/${c}/action`, 'POST', { action: 'close' }), call(r, `/api/scenes/${c}/action`, 'POST', { action: 'close' })]);
  if ((await db`SELECT status FROM som.scenes WHERE id = ${c}`)[0]?.status === 'closed') closedTogether++;
}
check(deletedTogether === 6, `both agreeing to delete at the same moment deletes it (${deletedTogether}/6)`);
check(closedTogether === 6, `both back to “us” at the same moment closes it (${closedTogether}/6)`);

const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
