// Templates and novelty, on two small phones. A new offer starts from your
// last one of its kind (hours, who leads). Kay saves her workday as
// a template, which sets the shape of the next one in a tap but never what's
// in it. "Fill it for me" steers away from what the last scene used, and
// roleplays never played come first, with how often and when the others
// were played.
import { audit, BASE, check, db, finish, newPod, SMALL, TITLES } from '../lib.mjs';

console.log(`on ${SMALL}`);
const { b, r } = await newPod(SMALL);
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = async (p) => { await sheet(p).getByRole('button', { name: 'Close' }).first().click(); };
const pressed = async (l) => (await l.getAttribute('aria-pressed')) === 'true';
const offerSheet = async () => {
  await r.goto(`${BASE}/`);
  await r.getByRole('button', { name: `Offer ${TITLES.follow} a scene` }).click();
  await sheet(r).getByRole('button', { name: 'Tomorrow' }).waitFor();
};
const roleplaySheet = async () => {
  await r.goto(`${BASE}/`);
  await r.getByRole('button', { name: '🎭 Ask for a roleplay' }).click();
  await sheet(r).getByRole('button', { name: 'Tomorrow' }).waitFor();
};

// ── Kay offers her workday and saves it as a template ──────────────────────
await offerSheet();
check(await r.inputValue('#window-from') === '08:30', 'the very first offer starts at 8:30 to 4:30');
await sheet(r).locator('#window-from').fill('07:00');
await sheet(r).getByRole('button', { name: '8 hours' }).click();
await sheet(r).getByLabel(`A note for ${TITLES.follow} (optional)`).fill('Workday rules apply.');
await sheet(r).getByRole('button', { name: 'Save as a template' }).click();
await sheet(r).getByLabel('Template name').fill('Workday');
await audit(r, 'save a template');
await sheet(r).getByRole('button', { name: 'Save template' }).click();
await sheet(r).getByText('Saved “Workday”.').waitFor();
await sheet(r).getByRole('button', { name: 'Send the offer' }).click();
await r.waitForURL(/\/scene\//);
const workday = r.url().split('/').pop();
check(true, 'a template is saved from the offer, in a tap and a name');

// ── The next offer remembers; the template sets the shape ───────────────────
await offerSheet();
check(await r.inputValue('#window-from') === '07:00' && await r.inputValue('#window-until') === '15:00', 'the next offer starts from her last one’s hours (7 to 3)');
await sheet(r).locator('#window-from').fill('10:00');
await sheet(r).getByRole('button', { name: `${TITLES.follow.split(' ')[0]} leads` }).click();
await sheet(r).getByRole('button', { name: 'Workday' }).click();
check(await r.inputValue('#window-from') === '07:00' && await r.inputValue('#window-until') === '15:00'
  && await r.inputValue('#offer-note') === 'Workday rules apply.' && await pressed(sheet(r).getByRole('button', { name: 'I lead' })),
  'tapping “Workday” sets its hours, note and who leads');
await sheet(r).getByText('the shape is set; what’s in it is new').waitFor();
await audit(r, 'offer from a template');
await closeSheet(r);
await r.goto(`${BASE}/menu`);
await r.getByRole('button', { name: /^Templates/ }).click();
check((await r.getByText('07:00–15:00 · Kay leads · tasks').count()) === 1, 'the Menu page lists templates, to delete');

// ── Fill it for me: something new each time ─────────────────────────────────
async function filled(p) {
  await p.goto(`${BASE}/`);
  await p.getByRole('button', { name: 'Build one now' }).click();
  await p.waitForURL(/\/scene\//);
  await p.getByRole('button', { name: /Fill it for me/ }).click();
  await p.getByText('Saved').waitFor({ timeout: 10000 });
  await p.getByRole('button', { name: 'Start now' }).click();
  return sheet(p).locator('ol li').allInnerTexts();
}
const first = await filled(r);
await sheet(r).getByRole('button', { name: 'Start now' }).click();
await r.getByText(`${TITLES.follow}’s tasks`).waitFor();
const second = await filled(r);
await closeSheet(r);
check((await r.getByText('New first: it skips what your last few scenes used').count()) === 1, 'the builder says it fills with new things first');
// Getting ready, four chores (two areas, two in each), the devotion and one for Kay. The starter menu has six chores,
// so the second scene takes the two the first didn't use, and the devotion and one for Kay are new.
const fresh = second.slice(1, 5).filter((t) => !first.includes(t));
check(first.length === 7 && second.length === 7 && fresh.length >= 2 && !first.includes(second[5]) && !first.includes(second[6]),
  `new first: the chores last time didn’t have, a different devotion and one for Kay (${first.slice(1).join(', ')} → ${second.slice(1).join(', ')})`);

// ── Roleplays: never played first ───────────────────────────────────────────
await r.goto(`${BASE}/menu`);
await r.getByRole('button', { name: /^Roleplays/ }).click();
await r.getByLabel('Import roleplays').setInputFiles({ name: 'rp.txt', mimeType: 'text/plain', buffer: Buffer.from(`## Indoor
- Tea time
  Leads: {follow}
  Setup: A tray, two cups.
- The night shift
  Leads: {follow}
  Setup: Late for the shift.
`) });
await r.getByRole('button', { name: /Tea time/ }).waitFor();
await r.getByRole('button', { name: 'Save menu' }).click();
await r.getByText('Saved.').waitFor();
// Kay takes the workday offer back (it'd overlap), and asks for "Tea time" with Sunny leading.
await r.goto(`${BASE}/scene/${workday}`);
await r.getByRole('button', { name: 'Take it back' }).click();
await r.getByText('Draft').first().waitFor();
await roleplaySheet();
check((await sheet(r).getByText('🆕 Not played yet').count()) === 2, 'roleplays never played say so');
await sheet(r).getByRole('radio', { name: /Tea time/ }).click();
await sheet(r).getByRole('button', { name: `Send it to ${TITLES.follow.split(' ')[0]}` }).click();
await r.waitForURL(/\/scene\//);
const tea = r.url().split('/').pop();
await b.goto(`${BASE}/scene/${tea}`);
await b.getByRole('button', { name: 'Accept: it’s on' }).click();
await b.getByRole('button', { name: 'Start the scene' }).waitFor();
await db`UPDATE som.scenes SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '2 hours' WHERE id = ${tea}`;
await r.goto(`${BASE}/scene/${tea}`);
await r.getByRole('button', { name: 'Start the scene' }).click();
await r.getByText('A tray, two cups.').waitFor();
check(true, 'Kay plays “Tea time” (Sunny leads)');

await offerSheet();
check(await pressed(sheet(r).getByRole('button', { name: 'I lead' })) && (await sheet(r).getByRole('radio').count()) === 0,
  'a roleplay doesn’t change the next scene offer: it starts from the last scene (Kay leads), with no roleplays in it');
await closeSheet(r);
await roleplaySheet();
const options = await sheet(r).getByRole('radio').allInnerTexts();
check(options[0].includes('The night shift') && options[0].includes('🆕 Not played yet') && /Played 1× · last/.test(options[1] ?? ''),
  'the one never played comes first; the other says it was played once, and when');
await audit(r, 'roleplays, new first');
await closeSheet(r);

const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
