// Setting up a pod, pairing a partner's phone, unlocking a new phone, and
// the menu: everything written is encrypted on the phone first.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, RUN, TITLES, account, call, check, databaseText, db, finish, login, newPod, phone } from '../lib.mjs';

const { b, r, lead, podId } = await newPod();
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

// The menu: imported from a file, encrypted before it's saved.
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
await b.locator('input[type=file][accept*=json]').setInputFiles(menuFile);
await b.getByText('Imported. Check it over').waitFor();
check(b.dialogs.some((d) => d.includes(`Our menu ${RUN}`) && d.includes('2 items')), 'importing a menu file asks first, naming it and counting its items');
await b.getByRole('button', { name: 'Save menu' }).click();
await b.getByText('All saved').or(b.getByText('Saved.')).first().waitFor();
await r.goto(`${BASE}/menu`);
await r.getByText(`Our menu ${RUN}`).or(r.locator(`input[value="Our menu ${RUN}"]`)).first().waitFor({ timeout: 10000 }).catch(() => {});
check((await r.inputValue('#m-name')) === `Our menu ${RUN}`, 'the partner’s phone shows the imported menu');
text = await databaseText();
check(!text.includes(`Gratitude list ${RUN}`) && !text.includes(`Our menu ${RUN}`), 'the menu is stored encrypted');

const errors = [...b.errors, ...r.errors, ...r2.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
