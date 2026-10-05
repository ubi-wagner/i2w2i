// A staged scene, on two small phones. Kay builds the whole scene first,
// with what Sunny needs to get ready beforehand (equipment, new clothes),
// sees it as one sheet and offers it; Sunny sees all of it before saying
// yes; it stays as staged once agreed; Sunny ticks off what she's got
// ready. An offer made before anything is built says so.
import { audit, BASE, check, db, finish, newPod, SMALL, TITLES } from '../lib.mjs';

console.log(`on ${SMALL}`);
const { b, r } = await newPod(SMALL);
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = async (p) => { await sheet(p).getByRole('button', { name: 'Close' }).first().click(); };
const AHEAD = ['A locking collar', 'Black stockings, size M'];

// ── Kay builds it first ─────────────────────────────────────────────────────
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: `Offer ${TITLES.follow} a scene` }).click();
await sheet(r).getByRole('button', { name: 'Build it first, then offer it' }).click();
await r.waitForURL(/\/scene\//);
const id = r.url().split('/').pop();
await r.getByRole('button', { name: '4 hours' }).click();
await r.getByRole('button', { name: /Fill it for me/ }).click();
await r.locator('#plan-ahead').fill(AHEAD.join('\n'));
await r.fill('#plan-title', 'Saturday, staged');
await r.getByText('Saved').waitFor({ timeout: 10000 });
const planned = Number((await r.getByText(/^\d+ tasks? ·/).innerText()).match(/^(\d+)/)[1]);
await r.getByRole('button', { name: 'See the whole scene' }).click();
const whole = sheet(r).getByRole('region', { name: 'The whole scene' });
await whole.waitFor();
const wholeText = (await whole.innerText()).toLowerCase();
check(AHEAD.every((a) => wholeText.includes(a.toLowerCase())) && wholeText.includes('1. home') && wholeText.includes('2. out') && wholeText.includes('what to wear'),
  `Kay sees the whole scene as one sheet: what to get ready, what to wear, both blocks (${planned} tasks)`);
await audit(r, 'the whole scene (lead)');
await sheet(r).getByRole('button', { name: 'Offer it' }).click();
await sheet(r).getByText(`${TITLES.follow} sees the whole scene (${planned} tasks, 2 to get ready beforehand) before saying yes.`).waitFor();
check(await r.inputValue('#window-from') === '08:30' && await r.inputValue('#window-until') === '12:30', 'the offer starts from the staged day’s length (4 hours)');
await sheet(r).getByRole('button', { name: 'Send the offer' }).click();
await r.getByText('Your offer').waitFor();
check((await r.getByRole('region', { name: 'The whole scene' }).count()) === 1, 'Kay’s offer shows the whole scene while she waits');

// ── Sunny sees all of it before saying yes ──────────────────────────────────
await b.goto(`${BASE}/scene/${id}`);
await b.getByText(`${TITLES.lead} offers you a scene`).waitFor();
const seen = b.getByRole('region', { name: 'The whole scene' });
await seen.waitFor();
const seenText = await seen.innerText();
const lines = await seen.getByRole('listitem').count();
check(AHEAD.every((a) => seenText.includes(a)) && seenText.includes('Saturday, staged') && seenText.includes('Proof:') && seenText.includes('Check-ins: at the end of each block'),
  'before saying yes, Sunny sees the whole scene: what to get ready, every task with its proof, check-ins');
check(lines >= planned, `…every task is listed (${lines} lines for ${planned} tasks)`);
await audit(b, 'an offer with the whole scene');
await b.getByRole('button', { name: /^Accept/ }).first().click();
await b.getByText(`${TITLES.lead} is building your scene`).waitFor();
check((await b.getByRole('region', { name: 'The whole scene' }).count()) === 1, 'after accepting, she still sees it');

// ── It stays as staged; once sent, Sunny ticks off what she has ready ───────
await r.goto(`${BASE}/scene/${id}`);
await r.getByText(`Agreed with ${TITLES.follow}`).waitFor();
check(Number((await r.getByText(/^\d+ tasks? ·/).innerText()).match(/^(\d+)/)[1]) === planned, 'once agreed, the staged scene is kept as it was (not refilled)');
await r.getByRole('button', { name: `Send to ${TITLES.follow}` }).click();
await sheet(r).getByRole('button', { name: 'Send it' }).click();
await r.getByText(`${TITLES.follow} starts it; you’ll hear when.`).waitFor();
await b.goto(`${BASE}/scene/${id}`);
const ready = b.getByRole('region', { name: 'Get ready beforehand' });
await ready.waitFor();
await ready.getByText(AHEAD[0]).click();
check(await ready.getByLabel(AHEAD[0]).isChecked() && !(await ready.getByLabel(AHEAD[1]).isChecked()), 'on the ready screen Sunny ticks off what she has ready');
await audit(b, 'ready, with what to get ready');

// ── An offer with nothing built yet says so ─────────────────────────────────
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: `Offer ${TITLES.follow} a scene` }).click();
await sheet(r).locator('#window-from').fill('18:00');
await sheet(r).getByRole('button', { name: '2 hours' }).click();
await sheet(r).getByRole('button', { name: 'Send the offer' }).click();
await r.waitForURL(/\/scene\//);
const bare = r.url().split('/').pop();
await b.goto(`${BASE}/scene/${bare}`);
await b.getByText(`Not built yet: ${TITLES.lead} builds it once it’s agreed`).waitFor();
check(true, 'an offer made before building says it’s not built yet, and that she’ll see it all before it starts');

const [{ n }] = await db`SELECT count(*)::int AS n FROM som.scenes WHERE id = ${id} AND status = 'ready'`;
check(n === 1, 'the staged scene is sent');
const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
