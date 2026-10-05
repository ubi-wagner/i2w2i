// Nothing lost, nobody stuck. Edits made offline save themselves once the
// connection is back, and the last tap before leaving a page is kept; a
// menu saved on two phones at once never silently drops either; once a
// scene is agreed either of you can change the time or call it off, and
// the lead can say "not now" to a proposal; nothing moves while paused; a
// retried note or demand arrives once; an upload that never finished can
// be removed; an invite nobody opened doesn't hold up closing a scene.
import { audit, BASE, call, check, db, finish, newPod, pick, runningScene, SMALL, TITLES } from '../lib.mjs';

console.log(`on ${SMALL}`);
const { b, r, podId, follow } = await newPod(SMALL);
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = async (p) => { await sheet(p).getByRole('button', { name: 'Close' }).first().click(); };
const status = async (id) => (await db`SELECT status, starts_at, offered_by FROM som.scenes WHERE id = ${id}`)[0];

// ── Offline edits save themselves; the last tap before leaving is kept ──────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const draft = b.url().split('/').pop();
await b.getByText(/Changes save themselves|Saved/).first().waitFor();
await b.context().setOffline(true);
await pick(b, 1, 'Getting ready', 'Shower');
await b.getByText(/Not saved: No connection/).waitFor({ timeout: 15000 });
check(true, 'offline, a pick says it isn’t saved yet (and why)');
await b.context().setOffline(false);
await b.getByRole('status').filter({ hasText: 'Saved' }).waitFor({ timeout: 20000 });
check(true, '…and saves itself once the connection is back');
await pick(b, 1, 'Devotion', 'Write a love note');
await b.getByRole('link', { name: /Scenes/ }).first().click();
await b.waitForURL(`${BASE}/`);
await b.goto(`${BASE}/scene/${draft}`);
await b.getByRole('group', { name: /^Block 1: Devotion/ }).getByText('Write a love note').waitFor({ timeout: 10000 });
check(true, 'a pick made just before leaving the page is kept');

// ── The lead can say "not now" to a proposal, or give it a time ─────────────
await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText(`Sent to ${TITLES.lead}`).waitFor();
await r.goto(`${BASE}/scene/${draft}`);
await r.getByRole('button', { name: 'Offer a time' }).waitFor();
await r.getByRole('button', { name: 'Not now' }).click();
await r.getByText('Draft').first().waitFor();
check((await status(draft)).status === 'draft', 'the lead says “not now” to a proposal: back to a draft');

// ── A request, once agreed: either can change the time or call it off ───────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: `Ask ${TITLES.lead} for a scene` }).click();
await sheet(b).getByRole('button', { name: 'Send the request' }).click();
await b.waitForURL(/\/scene\//);
const req = b.url().split('/').pop();
await r.goto(`${BASE}/scene/${req}`);
await r.getByRole('button', { name: /^Accept/ }).first().click();
await r.getByText(`Agreed with ${TITLES.follow}`).waitFor();
check(await r.getByRole('button', { name: 'Change the time' }).isVisible() && await r.getByRole('button', { name: 'Call it off' }).isVisible(),
  'the lead who accepted a request can change its time or call it off');
await b.goto(`${BASE}/scene/${req}`);
await b.getByRole('button', { name: 'Ask for a different time' }).waitFor();
await audit(b, 'accepted, as the one who asked');
await b.getByRole('button', { name: 'Ask for a different time' }).click();
await sheet(b).getByRole('button', { name: '2 hours' }).click();
await sheet(b).getByRole('button', { name: 'Send the new time' }).click();
await b.getByText(`Waiting for ${TITLES.lead} to answer.`).waitFor();
check((await status(req)).status === 'offered', 'the follow asks for a different time: it’s an offer again, for the lead to answer');
await r.goto(`${BASE}/scene/${req}`);
await r.getByRole('button', { name: /^Accept/ }).first().click();
await r.getByText(`Agreed with ${TITLES.follow}`).waitFor();
await b.goto(`${BASE}/scene/${req}`);
await b.getByRole('button', { name: 'Can’t make it this time' }).click();
await b.getByText('Draft').first().waitFor();
const off = await status(req);
check(off.status === 'draft' && off.starts_at === null && off.offered_by === null, 'either can call it off: back to a draft, its time freed');

// ── Two phones save the menu: nothing silently lost ─────────────────────────
await b.goto(`${BASE}/menu`);
await r.goto(`${BASE}/menu`);
await b.locator('#m-name').fill(`Sunny’s name ${Date.now()}`);
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('Saved.').waitFor();
await r.locator('#m-name').fill('Kay’s name');
const dialogs = r.dialogs.length;
await r.getByRole('button', { name: 'Save menu' }).click();
await r.getByText('Saved.').waitFor({ timeout: 15000 });
check(r.dialogs.slice(dialogs).some((d) => d.includes('Save yours over theirs?')), 'saving over a newer menu asks first instead of dropping your edits');
await b.reload();
check(await b.inputValue('#m-name') === 'Kay’s name', '…and saves yours when you say so');
// A template saved from a phone with an older copy goes on top of the newer menu.
await b.locator('#m-name').fill('Sunny again');
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('Saved.').waitFor();
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: `Offer ${TITLES.follow} a scene` }).click();
await sheet(r).getByRole('button', { name: 'Save as a template' }).click();
await sheet(r).getByLabel('Template name').fill('Clash test');
await sheet(r).getByRole('button', { name: 'Save template' }).click();
await sheet(r).getByText('Saved “Clash test”.').waitFor();
await closeSheet(r);
await r.goto(`${BASE}/menu`);
check(await r.inputValue('#m-name') === 'Sunny again' && (await r.getByRole('button', { name: /^Templates/ }).innerText()).includes('1'),
  'a template saved on top of a newer menu keeps both');

// ── Nothing moves while paused ──────────────────────────────────────────────
const run = await runningScene(b, r, { title: 'Pause test', picks: [[1, 'Two chores', 'Laundry: wash']] });
await b.goto(`${BASE}/scene/${run}`);
await b.getByRole('button', { name: 'Pause' }).click();
await b.getByText('You paused the scene').waitFor();
await r.goto(`${BASE}/scene/${run}`);
await r.getByText('Paused: the inspection waits until it’s resumed.').waitFor();
check(await r.getByRole('button', { name: 'Start the inspection' }).isDisabled(), 'while paused, the lead’s “Start the inspection” waits');
check((await call(r, `/api/scenes/${run}/action`, 'POST', { action: 'inspect' })).status === 409, '…and the server refuses it too');
await audit(r, 'paused, lead');
await b.getByRole('button', { name: 'Resume' }).click();
await b.getByText('You paused the scene').waitFor({ state: 'detached' });
await b.getByText('Your tasks').waitFor();
check((await call(r, `/api/scenes/${run}/action`, 'POST', { action: 'aftercare' })).status === 409, 'a scene from the menu never skips its inspection (only a roleplay does)');

// ── A retried note or demand arrives once ───────────────────────────────────
const noteId = crypto.randomUUID();
const note = { id: noteId, kind: 'comment', bodyEnc: 'j1.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb' };
const first = await call(b, `/api/scenes/${run}/entries`, 'POST', note);
const again = await call(b, `/api/scenes/${run}/entries`, 'POST', note);
const [{ n: notes }] = await db`SELECT count(*)::int AS n FROM som.entries WHERE id = ${noteId}`;
check(first.status === 200 && again.status === 200 && notes === 1, 'the same note sent twice (a retry) is there once');
const demandId = crypto.randomUUID();
const demand = { id: demandId, bodyEnc: 'j1.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb', minutes: null };
await call(r, `/api/scenes/${run}/tasks`, 'POST', demand);
await call(r, `/api/scenes/${run}/tasks`, 'POST', demand);
const [{ n: demands }] = await db`SELECT count(*)::int AS n FROM som.tasks WHERE id = ${demandId}`;
check(demands === 1, 'the same demand sent twice is there once');
await db`DELETE FROM som.entries WHERE id = ${noteId}`;
await db`DELETE FROM som.tasks WHERE id = ${demandId}`;

// ── An upload that never finished can be removed by whoever sent it ─────────
const [{ id: sunnyId }] = await db`SELECT a.id FROM som.accounts a JOIN som.members m ON m.account_id = a.id WHERE m.pod_id = ${podId} AND m.role = 'follow'`;
const [{ id: laundry }] = await db`SELECT id FROM som.tasks WHERE scene_id = ${run} ORDER BY ord LIMIT 1`;
const stuck = crypto.randomUUID();
await db`INSERT INTO som.media (id, scene_id, task_id, uploader_id, object_key, bytes, chunk_bytes, file_key_enc, nonce, meta_enc, status, created_at)
         VALUES (${stuck}, ${run}, ${laundry}, ${sunnyId}, ${`s/${run}/${stuck}`}, 100, 8388608, 'x', 'x', 'x', 'uploading', now() - interval '10 minutes')`;
await b.reload();
await b.getByRole('button', { name: /Laundry: wash/ }).click();
await sheet(b).getByText('Didn’t finish').waitFor();
await audit(b, 'an upload that didn’t finish');
await sheet(b).getByRole('button', { name: 'Remove' }).click();
await sheet(b).getByText('Didn’t finish').waitFor({ state: 'detached', timeout: 10000 });
check((await db`SELECT 1 FROM som.media WHERE id = ${stuck}`).length === 0, 'an upload that never finished shows as such, and its sender removes it');
await closeSheet(b);

// ── An invite nobody opened doesn't hold up closing a scene ─────────────────
await b.goto(`${BASE}/settings`);
await b.getByText('Add someone else').click();
await b.getByLabel('Name', { exact: true }).fill('Never joins');
await b.getByLabel('Username', { exact: true }).fill(`never-${Date.now().toString(36)}`);
if (await b.locator('#pod-pass').isVisible()) await b.fill('#pod-pass', follow.vault);
await b.getByRole('button', { name: 'Add them' }).click();
await b.getByLabel('Their key link').waitFor();
await r.goto(`${BASE}/scene/${run}`);
await r.getByRole('button', { name: 'Start the inspection' }).click();
await r.getByText('Scorecard').first().waitFor();
for (const cat of ['Presentation', 'Task completion', 'Quality of work', 'Attitude']) await r.getByRole('radiogroup', { name: cat, exact: true }).getByRole('radio', { name: '4' }).click();
await r.getByRole('button', { name: `Share with ${TITLES.follow}` }).click();
await r.getByRole('region', { name: 'Results' }).waitFor();
await r.getByRole('button', { name: 'Time for aftercare' }).click();
await r.getByRole('button', { name: 'I’m back to us' }).click();
await b.goto(`${BASE}/scene/${run}`);
await b.getByRole('button', { name: 'I’m back to us' }).click();
await b.getByText('tasks approved').waitFor({ timeout: 15000 });
check((await status(run)).status === 'closed', 'with a third member who never opened their invite, the two of you still close the scene');

const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
