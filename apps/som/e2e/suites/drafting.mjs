// Drafting as people really type: key by key, with spaces and new lines, in
// the scene builder (its name, a blank to fill in, a task of your own, what
// to get ready, the note) and the inspection's rewards. Nothing typed is
// eaten as it saves or by the next poll, and it reaches the tasks trimmed.
// And a draft is its author's: Kay watches Sunny's being built (both phones
// say so), view only, and the server refuses Kay's changes until it's sent.
import { BASE, call, check, finish, newPod, pick, TITLES, typeIn } from '../lib.mjs';

const { b, r } = await newPod();
const sheet = (p) => p.locator('dialog[open]').last();
const whatNow = (p) => p.getByRole('region', { name: 'What now' }).innerText();
const typed = async (loc, text, what) => {
  const v = await typeIn(loc, text);
  check(v === text, `typing ${what} key by key keeps every space${text.includes('\n') ? ' and new line' : ''}${v === text ? '' : ` (got ${JSON.stringify(v)})`}`);
};

// ── Sunny drafts, typing as she goes ────────────────────────────────────────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const id = b.url().split('/').pop();
await typed(b.locator('#plan-title'), 'Friday night in', 'the scene’s name');
await b.getByRole('button', { name: '4 hours' }).click();
await pick(b, 2, 'Change-over', 'Out of the cleaning clothes');
const blank = b.getByLabel('Out of the cleaning clothes, into ___ for going out: what');
await typed(blank, 'a sun dress ', 'a blank to fill in (even a space at the end, mid-word)');
await typed(blank, 'a sun dress', 'a blank to fill in');
await b.getByRole('group', { name: `Block 1: For ${TITLES.lead} (15 min)` }).getByRole('button', { name: /^\+ / }).click();
await sheet(b).getByRole('button', { name: '✍️ Write your own' }).click();
await typed(sheet(b).getByLabel('Your own: what to do'), 'Plan a picnic for two', 'a task of her own');
await typed(sheet(b).getByLabel('Your own: details'), 'Somewhere new.\nPack the blue blanket.', 'its details');
await sheet(b).getByRole('button', { name: 'Add it' }).click();
await sheet(b).getByRole('button', { name: 'Done', exact: true }).click();
await typed(b.locator('#plan-ahead'), 'A new candle\nFresh flowers', 'what to get ready, one per line');
await typed(b.locator('#plan-note'), 'Dinner first.\nThen we see.', 'the note');
await b.getByText('Saved').waitFor({ timeout: 10000 });
await b.waitForTimeout(3500); // a poll or two after saving
check(await b.inputValue('#plan-title') === 'Friday night in' && await b.inputValue('#plan-note') === 'Dinner first.\nThen we see.' && await blank.inputValue() === 'a sun dress',
  'after saves and polls, everything is as she typed it');
check((await whatNow(b)).includes(`${TITLES.lead} can see this draft as it saves, but can’t change it`), 'Sunny is told Kay can see her draft as it saves');

// ── Kay watches it being built ──────────────────────────────────────────────
await r.goto(`${BASE}/`);
const card = r.getByRole('link', { name: /Friday night in/ });
await card.waitFor();
check((await card.innerText()).includes(`${TITLES.follow} is building it: not sent yet`), 'Kay’s home shows Sunny’s draft, not sent yet');
check((await r.getByText('You both see every draft as it’s built').count()) === 1, '…and says plainly that drafts show to both');
await card.click();
await r.getByRole('region', { name: 'What now' }).waitFor();
check((await whatNow(r)).includes(`${TITLES.follow} is still building this draft. You see it as it saves; only ${TITLES.follow} can change it.`), 'Kay is told it’s Sunny’s draft, and hers to change');
check(await r.inputValue('#plan-note') === 'Dinner first.\nThen we see.', 'Kay sees the note as Sunny wrote it, line break and all');
check(await r.locator('#plan-title').isDisabled() && await r.locator('#plan-note').isDisabled(), 'it’s view only for Kay');
check(!(await r.getByRole('button', { name: /Fill it for me|^Start now$|^Offer a time$/ }).count()), '…with no Fill it for me, Start now or Offer a time');
check((await r.getByText(`${TITLES.follow}’s draft: view only`).count()) === 1, '…and says so where it would say it saved');
check((await call(r, `/api/scenes/${id}/plan`, 'PUT', { planEnc: 'j1.aaaa.bbbb', rev: 1 })).status === 403, 'the server refuses Kay’s changes to Sunny’s draft');
for (const action of ['start', 'offer']) {
  check((await call(r, `/api/scenes/${id}/action`, 'POST', { action, startsAt: new Date(Date.now() + 864e5).toISOString(), endsAt: new Date(Date.now() + 9e7).toISOString() })).status === 403,
    `…and won’t let her ${action === 'start' ? 'start it' : 'offer it'} before it’s sent`);
}

// ── Sent: it's Kay's to look at, change and start ───────────────────────────
await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText(`Sent to ${TITLES.lead}`).waitFor();
await r.reload();
await r.getByText('sent you this scene').waitFor();
check(!(await r.locator('#plan-title').isDisabled()), 'once Sunny sends it, Kay can change it');
await typed(r.locator('#plan-title'), 'Friday night in, together', 'the name, on Kay’s phone');
await r.getByText('Saved').waitFor({ timeout: 10000 });
await r.getByRole('button', { name: 'Start now' }).click();
await sheet(r).getByRole('button', { name: 'Start now' }).click();
await r.getByText(`${TITLES.follow}’s tasks`).waitFor();
await b.reload();
await b.getByText('Your tasks').waitFor();
check((await b.getByRole('button', { name: /into a sun dress for going out/ }).count()) === 1, 'the blank is filled in, in Sunny’s task');
await b.getByRole('button', { name: /Plan a picnic for two/ }).click();
check(await sheet(b).getByText('Somewhere new.\nPack the blue blanket.').count() === 1 || (await sheet(b).locator('p.whitespace-pre-wrap').first().innerText()) === 'Somewhere new.\nPack the blue blanket.',
  'her own task keeps its details, line by line');
await sheet(b).getByRole('button', { name: 'Close' }).first().click();

// ── The inspection: notes on two lines, a reward's blank ───────────────────
await r.getByRole('button', { name: 'Start the inspection' }).click();
await r.getByText('Scorecard').first().waitFor();
for (const cat of ['Presentation', 'Task completion', 'Quality of work', 'Attitude']) await r.getByRole('radiogroup', { name: cat, exact: true }).getByRole('radio', { name: '4' }).click();
await typed(r.getByLabel('Inspection notes'), 'A good day.\nThe picnic was perfect.', 'the inspection notes');
await r.getByRole('button', { name: /Massage/ }).click();
await typed(r.getByLabel('Massage: mins'), 'twenty, slow', 'a reward’s blank');
await r.getByRole('button', { name: `Share with ${TITLES.follow}` }).click();
await r.getByRole('region', { name: 'Results' }).waitFor();
await b.reload();
const results = await b.getByRole('region', { name: 'Results' }).innerText();
check(results.includes('A good day.\nThe picnic was perfect.') && results.includes('twenty, slow'), 'Sunny reads the notes as written and the reward as typed');

// ── Getting ready: up to 3 from each group ──────────────────────────────────
const looks = ['## Presentation: Getting ready', ...['Hair', 'Makeup', 'Shoes'].flatMap((g) => [`### ${g}`, ...[1, 2, 3, 4].map((n) => `- ${g} ${n} [1 photo]`)]),
  '## Changeover: Change-overs', ...['Going out', 'Back to the chores', 'Fresh up', 'Welcome home'].flatMap((g) => [`### ${g}`, ...[1, 2].map((n) => `- ${g} look ${n} [1 photo]`)])].join('\n');
await b.goto(`${BASE}/menu`);
await b.getByLabel('Import a menu file').setInputFiles({ name: 'looks.txt', mimeType: 'text/plain', buffer: Buffer.from(looks) });
await b.getByRole('button', { name: 'Save menu' }).first().click();
await b.getByText('Saved.').waitFor();
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const prep = b.getByRole('group', { name: 'Block 1: Getting ready (30 min)' });
await prep.getByRole('button', { name: /^\+ / }).click();
const inGroup = (g) => sheet(b).getByRole('group', { name: g, exact: true });
for (const g of ['Hair', 'Makeup']) for (const n of [1, 2, 3]) await inGroup(g).getByRole('button', { name: new RegExp(`${g} ${n}`) }).click();
check(await inGroup('Hair').getByRole('button', { name: /Hair 4/ }).isDisabled() && !(await inGroup('Shoes').getByRole('button', { name: /Shoes 1/ }).isDisabled()),
  'getting ready takes up to 3 from a group: a 4th waits, other groups are still open');
for (const n of [1, 2]) await inGroup('Shoes').getByRole('button', { name: new RegExp(`Shoes ${n}`) }).click();
check((await sheet(b).getByRole('status').first().innerText()).includes('8 picked: up to 3 from each group'), '…so far more than six in all (8 here)');
await sheet(b).getByRole('button', { name: 'Done', exact: true }).click();
check((await prep.innerText()).includes('8 picked'), '…and the block says how many');
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
await b.getByRole('button', { name: /Fill it for me/ }).click();
await b.getByText('Saved').waitFor({ timeout: 10000 });
const filled = await b.getByRole('group', { name: 'Block 1: Getting ready (30 min)' }).innerText();
check(['Hair', 'Makeup', 'Shoes'].every((g) => (filled.match(new RegExp(`${g} \\d`, 'g')) ?? []).length === 1), 'Fill it for me puts together a whole look: one from each group');
check(filled.indexOf('Hair ') < filled.indexOf('Makeup ') && filled.indexOf('Makeup ') < filled.indexOf('Shoes '), '…listed in the menu’s order, whatever order it picked them in');

// A long day: the free hour's play break holds as many as fit its time.
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
await b.getByRole('button', { name: '8 hours' }).click();
await b.getByRole('button', { name: /Fill it for me/ }).click();
await b.getByText('Saved').waitFor({ timeout: 10000 });
const playRow = b.getByRole('group', { name: /^Block 3: A play break/ });
const playText = await playRow.innerText();
const [, usedMin, freeMin] = /(\d+) of (\d+) min/.exec(playText) ?? [];
check(Number(freeMin) === 60 && Number(usedMin) > 20 && Number(usedMin) <= 60 && (playText.match(/×/g) ?? []).length >= 2,
  `the play break fills the free hour, more than one activity, without going over (${usedMin} of ${freeMin} min)`);
// Each change-over suits the block it leads into.
const change = (n) => b.getByRole('group', { name: `Block ${n}: Change-over (15 min)` }).innerText();
check((await change(2)).includes('Going out look'), 'the change-over into the block out is one for going out');
check((await change(4)).includes('Back to the chores look'), '…and the one back into a block at home is for the chores');
check((await b.getByRole('group', { name: `Block 5: Ready for ${TITLES.lead} (optional)` }).innerText()).includes('Welcome home look'), '…and the welcome home gets a welcome-home look');
// Picking one by hand, what suits the block comes first.
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
await b.getByRole('button', { name: '8 hours' }).click();
const firstGroup = async (n) => {
  await b.getByRole('group', { name: `Block ${n}: Change-over (15 min)` }).getByRole('button', { name: '+ Pick' }).click();
  const t = await sheet(b).getByRole('group').first().getAttribute('aria-label');
  await sheet(b).getByRole('button', { name: 'Done', exact: true }).click();
  return t;
};
check(await firstGroup(2) === 'Going out' && await firstGroup(4) === 'Back to the chores', 'picking a change-over by hand, the ones that suit the next block are listed first');

const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
