// Profiles, on two small phones. Each of them fills in their own: notes in
// their own words (limits, signals) and how much they like things, giving
// and getting (0–5). Kay adds something to their own list. Each reads the
// other's, Together shows where they meet, and Kay sees Sunny's limits when
// she builds a scene. The built-in list is for pod members only, and the
// database holds nothing readable.
import { account, audit, BASE, call, check, databaseText, finish, login, newPod, phone, SMALL, TITLES } from '../lib.mjs';

console.log(`on ${SMALL}`);
const { b, r, podId } = await newPod(SMALL);
const saved = (p) => p.getByText('Saved', { exact: true }).waitFor({ timeout: 10000 });
async function rate(p, label, give, get) {
  if (give !== undefined) await p.getByRole('radiogroup', { name: `${label}: give`, exact: true }).getByRole('radio', { name: String(give), exact: true }).click();
  if (get !== undefined) await p.getByRole('radiogroup', { name: `${label}: get`, exact: true }).getByRole('radio', { name: String(get), exact: true }).click();
}
const openSection = async (p, title) => {
  const h = p.getByRole('button', { name: new RegExp(`^${title}`) }).first();
  if ((await h.getAttribute('aria-expanded')) !== 'true') await h.click();
};

// ── Sunny fills in hers ─────────────────────────────────────────────────────
await b.goto(`${BASE}/us`);
await b.getByRole('tab', { name: 'Me' }).waitFor();
await b.getByLabel('Hard limits: never').fill('No marks that show above the collar.');
await b.getByLabel('Safeword and signals').fill('Red = stop, yellow = slow down.');
await b.getByLabel('What I like to be called').fill('Sunny, or good girl.');
await openSection(b, 'Touch & senses');
await rate(b, 'Slow kissing, no rush', 5, 5);
await rate(b, 'Playful spanking', 0, 4);
await saved(b);
check((await b.getByText(/^2 of \d+$/).count()) === 1, 'Sunny’s notes and ratings save themselves (2 rated)');
await audit(b, 'my profile');

// ── Kay fills in hers, and adds to their own list ───────────────────────────
await r.goto(`${BASE}/us`);
await openSection(r, 'Touch & senses');
await rate(r, 'Slow kissing, no rush', 4, 4);
await rate(r, 'Playful spanking', 5, 1);
await saved(r);
await r.getByLabel('Something to rate').fill('Breakfast in bed, then more');
await r.getByRole('button', { name: 'Add', exact: true }).click();
await r.getByText('Added “Breakfast in bed, then more”.').waitFor();
await openSection(r, 'Ours');
await rate(r, 'Breakfast in bed, then more', 4, 5);
await saved(r);
check(true, 'Kay rates the same things, and adds one of their own');

// ── Reading each other's ────────────────────────────────────────────────────
await r.getByRole('tab', { name: TITLES.follow }).click();
const limits = r.getByRole('region', { name: 'Limits' });
await limits.waitFor();
check((await limits.innerText()).includes('No marks that show above the collar.') && (await limits.innerText()).includes('Red = stop'), 'Kay sees Sunny’s hard limits and signals first');
check((await r.getByText('Give: 5 Can’t wait · Get: 5 Can’t wait').count()) === 1, '…and how much she likes each thing, giving and getting');
await audit(r, 'their profile');
await r.getByRole('tab', { name: 'Together' }).click();
const yes = r.getByRole('list', { name: 'You both want' });
await yes.waitFor();
const yesText = await yes.innerText();
check(yesText.includes('Playful spanking') && yesText.includes(`You give (5) → ${TITLES.follow} gets (4)`), 'Together: Kay giving a spanking and Sunny getting one is a yes');
check(yesText.includes(`${TITLES.follow} gives (5) → you get (4)`), '…and so is kissing, both ways');
await r.getByRole('button', { name: /^Show 1$/ }).click();
check((await r.getByRole('list', { name: 'Off the table' }).innerText()).includes(`${TITLES.follow} gives (0) → you get (1)`), 'a 0 from either is off the table');
await audit(r, 'together');

await b.reload();
await b.getByRole('tab', { name: 'Me' }).waitFor();
await openSection(b, 'Ours');
check((await b.getByText('Breakfast in bed, then more').count()) >= 1, 'Sunny sees the thing Kay added, to rate too');

// ── Kay sees Sunny's limits when she builds a scene ─────────────────────────
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: 'Build one now' }).click();
await r.waitForURL(/\/scene\//);
const note = r.getByRole('region', { name: `${TITLES.follow}’s limits` });
await note.waitFor();
check((await note.innerText()).includes('No marks that show above the collar.'), 'building a scene, Kay sees Sunny’s hard limits');

// ── Only for the pod; nothing readable at rest ──────────────────────────────
const stale = await call(b, `/api/pods/${podId}/profiles`, 'PUT', { bodyEnc: 'j1.aaaa.bbbb', rev: 0 });
check(stale.status === 409, 'a save from a phone that missed a newer one is refused, not lost');
const stranger = await account('Stranger');
const s = await phone('stranger', SMALL);
await login(s, stranger.username, stranger.password);
await s.waitForURL((u) => !u.pathname.startsWith('/login'));
check((await call(s, '/api/ideas')).status === 404 && (await call(s, `/api/pods/${podId}/profiles`)).status === 404, 'someone outside the pod gets neither the built-in list nor the profiles');
const all = await databaseText();
const found = ['No marks that show', 'Red = stop', 'good girl', 'Breakfast in bed', '"ratings"', 'bi-touch-'].filter((w) => all.includes(w));
check(found.length === 0, `nothing readable in the database${found.length ? `: ${found.join(', ')}` : ''}`);
const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
