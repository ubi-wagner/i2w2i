// Setting up a pod, pairing a partner's phone, unlocking a new phone, and
// the menu: everything written is encrypted on the phone first.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, RUN, TITLES, account, call, check, databaseText, db, finish, login, newPod, phone } from '../lib.mjs';

const { b, r, lead, follow, podId } = await newPod();
check(true, 'the follow sets up a pod and adds the lead; the lead opens the key link and chooses a passphrase');

const secret = new URL(lead.link).hash.match(/k=([^&]+)/)?.[1] ?? '';
check(secret.length >= 20, 'the key link carries its secret after the #, which browsers never send to the server');
let text = await databaseText();
check(!text.includes(secret), 'the key link’s secret is nowhere in the database');
// Account names and usernames are the server's (it signs people in); the pod's titles aren't.
check(!text.includes(TITLES.lead), 'the pod’s titles are stored encrypted');
const [m] = await db`SELECT invite, key_backup FROM som.members m JOIN som.accounts a ON a.id = m.account_id WHERE a.username = ${lead.username}`;
check(m.invite === null && m.key_backup !== null, 'once used, the key link is spent; the lead’s passphrase-wrapped key backup is kept');

// A new phone: the passphrase unlocks it, a wrong one doesn't.
const r2 = await phone('kay-new-phone');
await login(r2, lead.username, lead.password);
await r2.getByText('Unlock this phone').waitFor();
await r2.fill('#unlock-pass', 'not the right words at all');
await r2.getByRole('button', { name: 'Unlock' }).click();
await r2.getByText('didn’t open it').waitFor();
check(true, 'a wrong vault passphrase doesn’t unlock a new phone');
await r2.fill('#unlock-pass', lead.vault);
await r2.getByRole('button', { name: 'Unlock' }).click();
await r2.getByText(`Hello, ${TITLES.lead}`).waitFor({ timeout: 30000 });
check(true, 'the right passphrase unlocks it');

// The admin made the accounts but can't get into the pod.
const admin = await phone('admin');
await login(admin, process.env.E2E_ADMIN_USERNAME ?? 'admin', process.env.E2E_ADMIN_PASSWORD ?? 'admin-password-1');
await admin.waitForURL((u) => !u.pathname.startsWith('/login'));
const peek = await call(admin, `/api/pods/${podId}/scenes`);
check(peek.status === 404, 'the admin can’t see inside a pod they’re not in');
check((await call(admin, '/api/ideas')).status === 404, 'the built-in ideas are only for people in a pod (not the admin)…');
const anon = await phone('anon');
check((await anon.request.get(`${BASE}/api/ideas`)).status() === 401, '…and never for anyone signed out');

// Someone else entirely can't use a spent link.
const stranger = await account('Stranger');
const s = await phone('stranger');
await s.goto(lead.link);
await s.fill('#username', stranger.username);
await s.fill('#password', stranger.password);
await s.getByRole('button', { name: 'Sign in' }).click();
await s.waitForTimeout(2500);
check((await s.getByText('Choose your vault passphrase').count()) === 0, 'a key link does nothing for anyone but the person it was made for');

// Settings: with a partner in, adding another person is tucked away.
await b.goto(`${BASE}/settings`);
await b.getByText('Add someone else').waitFor();
check(!(await b.getByRole('button', { name: 'Add them' }).isVisible()), 'with a partner in the pod, “Add someone else” starts folded away');

// The menu: imported from a file (JSON or text), edited a section at a time
// as text, and encrypted before it's saved.
const menuFile = join(tmpdir(), `menu-${RUN}.json`);
writeFileSync(menuFile, JSON.stringify({
  name: `Our menu ${RUN}`,
  titles: TITLES,
  rooms: ['Kitchen', 'Lounge'],
  sections: [
    { kind: 'tasks', groups: [{ title: 'Writing', items: [{ label: `Gratitude list ${RUN}`, needs: [{ kind: 'text', count: 5, label: 'gratitudes' }] }] }] },
    { kind: 'play', groups: [{ title: 'Breaks', items: [{ label: 'Photo set', needs: [{ kind: 'photo', count: 4 }, 'video'] }] }] },
  ],
}));
await b.goto(`${BASE}/menu`);
const fileInput = b.getByLabel('Import a menu file');
await fileInput.setInputFiles(menuFile);
await b.getByText('updated. Check it over').waitFor();
check(b.dialogs.some((d) => d.includes(`menu-${RUN}.json`) && d.includes('Tasks and Play') && d.includes('other sections stay')), 'importing asks first, saying which sections it replaces and that the rest stay');
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('Saved.').waitFor();

// A text file with one section replaces just that section.
const textFile = join(tmpdir(), `errands-${RUN}.txt`);
writeFileSync(textFile, `## Errands: Out and about\n### Shops\n- Post office run ${RUN} [1 photo (the receipt)]\n- Flowers [2 photos + 1 note] (30 min)\n- this line has a [1 smell] proof\n`);
await fileInput.setInputFiles(textFile);
await b.getByText('Out and about updated').or(b.getByText('Errands updated')).first().waitFor();
const textDialog = b.dialogs.at(-1) ?? '';
check(textDialog.includes('Replace Errands') && textDialog.includes('1 line was not understood'), 'a text file with one section replaces only that one, and says which lines it couldn’t read');
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('Saved.').waitFor();

// Edit one section as text in the app.
await b.getByRole('button', { name: /^\d+\. Devotion/ }).click();
await b.getByRole('button', { name: 'Edit as text' }).click();
const box = b.getByLabel('Menu as text');
check((await box.inputValue()).includes(`- Gratitude list ${RUN} [5 notes (gratitudes)]`), '“Edit as text” shows the section the way it reads on paper, proof and all');
await box.fill(`${await box.inputValue()}\n- Ten affirmations ${RUN} [10 notes (affirmations) + 1 voice note]\nnot an item line`);
await b.getByLabel('Lines not understood').waitFor();
check((await b.getByRole('status').filter({ hasText: '2 items' }).count()) === 1, 'it counts what it understood as you type, and lists lines it didn’t');
await b.getByRole('button', { name: 'Apply' }).click();
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('Saved.').waitFor();

const [download] = await Promise.all([b.waitForEvent('download'), b.getByRole('button', { name: 'Download as text' }).click()]);
const downloaded = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
check(downloaded.includes(`# Our menu ${RUN}`) && downloaded.includes('## Errands: Out and about') && downloaded.includes(`- Ten affirmations ${RUN} [10 notes (affirmations) + 1 voice note]`) && downloaded.includes('## Play'),
  '“Download as text” gives the whole menu as an editable text file');

await r.goto(`${BASE}/menu`);
await r.locator('#m-name').waitFor();
await r.waitForFunction((v) => document.querySelector('#m-name')?.value === v, `Our menu ${RUN}`, { timeout: 10000 }).catch(() => {});
check((await r.inputValue('#m-name')) === `Our menu ${RUN}`, 'the partner’s phone shows the imported menu');
await r.getByRole('button', { name: /^\d+\. Out and about/ }).click();
check((await r.getByText(`Post office run ${RUN}`).count()) === 1, '…with the section edits');
text = await databaseText();
check(!text.includes(`Gratitude list ${RUN}`) && !text.includes(`Our menu ${RUN}`) && !text.includes(`Post office run ${RUN}`), 'the menu is stored encrypted');

// Ideas: a big pool; the menu is what's picked from it plus your own entries.
await b.goto(`${BASE}/menu`);
await b.getByRole('button', { name: /^\d+\. Play break/ }).click();
await b.getByRole('button', { name: 'Ideas for Play break' }).click();
const sheetB = b.locator('dialog[open]').last();
await sheetB.getByLabel('Search ideas').fill('squats');
await sheetB.getByRole('button', { name: /^\+ 20 squats, on video/ }).click();
await sheetB.getByRole('button', { name: /^✓ 20 squats, on video/ }).waitFor();
check(true, 'tapping an idea adds it to the menu (search narrows the pool)');
await sheetB.getByLabel('Search ideas').fill('self-bondage');
check((await sheetB.getByText('Self-bondage, done safely').count()) === 1, 'the pool includes common BDSM activities');
await sheetB.getByRole('button', { name: 'Close' }).first().click();
check((await b.getByRole('button', { name: /20 squats, on video/ }).count()) === 1, '…where it shows in its section, with its proof');
await b.getByRole('button', { name: /^\d+\. Arrival routine/ }).click();
await b.getByRole('button', { name: 'Ideas for Arrival routine' }).click();
await sheetB.getByLabel('Search ideas').fill('kiss');
check((await sheetB.getByRole('button', { name: `+ Kneel and kiss ${TITLES.lead}’s feet` }).count()) === 1, 'built-in ideas use the pod’s own titles');
await sheetB.getByRole('button', { name: 'Close' }).first().click();
await b.getByRole('button', { name: /^\d+\. Play break/ }).click();
const packFile = join(tmpdir(), `ideas-${RUN}.txt`);
writeFileSync(packFile, `## Play\n### Our private ideas\n- Private idea ${RUN} [3 photos + 1 video] (10 min)\n- Another ${RUN}\n## Errands\n### Out and about\n- Errand idea ${RUN} [1 photo]\n`);
await b.getByLabel('Import ideas').setInputFiles(packFile);
await b.getByText('Ideas added').waitFor();
check(b.dialogs.at(-1)?.includes('Add 3 ideas'), 'an ideas pack is added to your own ideas, after asking');
await b.getByRole('button', { name: 'Ideas for Play break' }).click();
await sheetB.getByText('Our private ideas').waitFor();
check((await sheetB.getByRole('button', { name: new RegExp(`^\\+ Private idea ${RUN}`) }).innerText()).includes('yours · 3 photos + 1 video · 10 min'), 'your own ideas come first, marked as yours');
await sheetB.getByRole('button', { name: new RegExp(`^\\+ Private idea ${RUN}`) }).click();
await sheetB.getByRole('button', { name: `Take “Another ${RUN}” out of your ideas` }).click();
await sheetB.getByRole('button', { name: new RegExp(`^\\+ Another ${RUN}`) }).waitFor({ state: 'detached' });
check(true, 'your own ideas can be taken out of the pool');
await sheetB.getByRole('button', { name: 'Close' }).first().click();
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('Saved.').waitFor();
text = await databaseText();
check(!text.includes(`Private idea ${RUN}`) && !text.includes(`Errand idea ${RUN}`), 'your ideas are stored encrypted with the menu');

// From the scene builder, "More ideas" opens that section's ideas.
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
await b.getByRole('button', { name: '8 hours' }).click();
await b.getByRole('group', { name: /^Block 3: A play break/ }).getByRole('button', { name: /^\+ / }).click();
check((await b.locator('dialog[open]').getByRole('button', { name: new RegExp(`Private idea ${RUN}`) }).count()) === 1, 'ideas picked into the menu show up when building a scene');
await b.locator('dialog[open]').getByRole('link', { name: 'More ideas…' }).click();
await b.waitForURL(/\/menu#play/);
await b.locator('dialog[open]').getByLabel('Search ideas').waitFor();
check(true, '“More ideas” in the builder opens that section’s ideas');

// ── A forgotten password: whoever added you resets it ───────────────────────
const r3 = await phone('kay-forgot');
await r3.goto(`${BASE}/login`);
await r3.getByText('Forgot your password? Whoever added you can reset it').waitFor();
check(true, 'the sign-in screen says what to do about a forgotten password');
await b.goto(`${BASE}/settings`);
await b.fill('#pod-pass', follow.vault);
await b.getByRole('button', { name: 'Reset password' }).click();
await b.getByLabel('Their password').waitFor();
const fresh = await b.getByLabel('Their password').innerText();
check(fresh.length >= 8 && fresh !== lead.password && (await b.getByLabel('Their username').innerText()) === lead.username,
  'Sunny (who added Kay) resets her password and sees the new one to pass on, with Kay’s username');
check((await call(r3, '/api/login', 'POST', { username: lead.username, password: lead.password })).status !== 200, 'the old password no longer works');
await r.goto(`${BASE}/`);
await r.waitForURL(/\/login/);
check(true, 'Kay is signed out everywhere until she has the new one');
await login(r, lead.username, fresh);
await r.getByText(`Hello, ${TITLES.lead}`).waitFor({ timeout: 30000 });
check(true, 'on her own phone the new password is all she needs: her scenes are still unlocked');
await login(r3, lead.username, fresh);
await r3.getByText('Unlock this phone').waitFor();
await r3.fill('#unlock-pass', lead.vault);
await r3.getByRole('button', { name: 'Unlock' }).click();
await r3.getByText(`Hello, ${TITLES.lead}`).waitFor({ timeout: 30000 });
check(true, 'on another phone, the new password and her same vault passphrase open everything');
await r.goto(`${BASE}/settings`);
await r.getByText('Your pod').first().waitFor();
check((await r.getByRole('button', { name: 'Reset password' }).count()) === 0 && (await r.getByRole('button', { name: 'New key link' }).count()) === 0,
  'Kay didn’t add Sunny, so she isn’t offered buttons that would only refuse her');

const errors = [...b.errors, ...r.errors, ...r2.errors, ...r3.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
