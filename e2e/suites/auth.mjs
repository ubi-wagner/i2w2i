// Accounts: usernames and starting passwords handed out by whoever adds
// someone (nothing is ever emailed), resets, deactivation, roles, sessions.
import { ADMIN, BASE, RUN, acceptInvite, adminPage, check, db, finish, login, page, readCredentials } from '../lib.mjs';

const anon = await page();
await anon.goto(BASE + '/admin');
check(anon.url().includes('/login?next=%2Fadmin'), 'signed-out visit to /admin goes to sign-in, remembering where to return');

// Wrong password keeps the username and says so; right password returns to ?next
await anon.fill('#username', ADMIN.username);
await anon.fill('#password', 'not-the-password');
await anon.getByRole('button', { name: 'Sign in' }).click();
await anon.getByText('don’t match').waitFor();
check((await anon.inputValue('#username')) === ADMIN.username, 'wrong password: error shown, username kept');
await anon.fill('#password', ADMIN.password);
await anon.getByRole('button', { name: 'Sign in' }).click();
await anon.waitForURL(BASE + '/admin');
check(true, 'signing in with a username returns to the page that was asked for');

const byEmail = await page();
await login(byEmail, ADMIN.email.toUpperCase(), ADMIN.password);
check(true, 'an account made before usernames can still sign in with its email (any case)');

const admin = await adminPage();
await admin.goto(BASE + '/');
check(await admin.getByRole('heading', { name: 'Your events' }).isVisible(), 'admin home lists their events');
check(!(await admin.getByRole('heading', { name: 'Couples' }).isVisible()), 'the Couples app is invisible without an explicit grant, even to admin');
check((await (await admin.goto(BASE + '/couples'))?.status()) === 404, 'Couples is a 404 for admin');

// Adding someone: a username suggested from the name, and a starting password
await admin.goto(BASE + '/admin');
const form = admin.locator('form', { has: admin.getByRole('button', { name: 'Add person' }) });
const nameBox = form.getByLabel('Name', { exact: true });
const userBox = form.getByLabel('Username', { exact: true });
const pwBox = form.getByLabel('Starting password');
await nameBox.fill(`Aunt Mae ${RUN}`);
check((await userBox.inputValue()) === `aunt.mae.${RUN}`, 'a username is suggested from the name');
const suggested = await pwBox.inputValue();
check(/^[a-z]+-[a-z]+-[a-z]+$/.test(suggested), 'a three-word starting password is suggested');
await form.getByRole('button', { name: 'Suggest another password' }).click();
check((await pwBox.inputValue()) !== suggested, '…and another on request');
const maeUser = `mae-${RUN}`;
await userBox.fill(maeUser.toUpperCase());
check((await userBox.inputValue()) === maeUser, 'usernames are lower case as you type');
await form.getByRole('button', { name: 'Add person' }).click();
const mae1 = await readCredentials(form);
check(mae1.username === maeUser && mae1.password.split('-').length === 3, 'the admin gets the username and password to pass on');
check(await form.getByRole('button', { name: 'Copy message' }).isVisible(), '…with a ready-made message to copy');
check((await nameBox.inputValue()) === '' && (await userBox.inputValue()) === '', 'the form clears for the next person');
const [maeRow] = await db`SELECT email, platform_role, password_hash IS NOT NULL AS has_pw FROM core.users WHERE username = ${maeUser}`;
check(maeRow && maeRow.email === null && maeRow.has_pw && maeRow.platform_role === 'member', 'no email needed; the account starts with that password');

// A username can't be taken twice; the form keeps what was typed
await nameBox.fill(`Other Mae ${RUN}`);
await userBox.fill(maeUser);
await form.getByRole('button', { name: 'Add person' }).click();
await form.getByText('Someone already has the username').waitFor();
check(await form.getByText(`Try “${maeUser}2”`).isVisible(), 'a taken username is refused, with a free one suggested');
check((await nameBox.inputValue()) === `Other Mae ${RUN}` && !(await form.getByLabel('Their username').isVisible()), '…what was typed stays, and the previous person’s password is gone');

// Mae signs in with what she was given
const mae = await acceptInvite(mae1);
check(mae.url() === BASE + '/', 'the new person signs in with the username and password they were given');
await mae.goto(BASE + '/admin');
check(mae.url() === BASE + '/', 'members cannot open the People page');
const again = await page();
await login(again, maeUser.toUpperCase(), mae1.password);
check(true, 'usernames work in any case');

const forgot = await page();
await forgot.goto(BASE + '/login');
check(!(await forgot.getByRole('button', { name: 'Email me a link' }).isVisible()), 'without email, the login page doesn’t offer emailed links');
check(await forgot.getByText('Ask the person who added you (or Eric) to reset it').isVisible(), '…and tells people how to get back in');

// Changing the password signs out other devices
await mae.goto(BASE + '/account');
await mae.fill('#current', mae1.password);
await mae.fill('#password', 'mae-password-2');
await mae.fill('#confirm', 'mae-password-2');
await mae.getByRole('button', { name: 'Change password' }).click();
await mae.getByText('Password saved.').waitFor();
await again.goto(BASE + '/');
check(again.url().includes('/login'), 'changing the password signs out other devices');
await mae.goto(BASE + '/');
check(mae.url() === BASE + '/', '…but not the device that changed it');
const kept = (await mae.context().cookies()).find((c) => c.name === 'i2w2i_session');
check(kept && kept.expires > Date.now() / 1000 + 80 * 86_400, 'using the app keeps you signed in (session renewed for ~90 days)');

// People can pick their own username, as long as it's free
await mae.goto(BASE + '/account');
const own = mae.locator('form', { has: mae.locator('#username') });
await own.locator('#username').fill(ADMIN.username);
await own.getByRole('button', { name: 'Save' }).click();
await own.getByText('Someone already has').waitFor();
check(true, 'a username someone else has is refused');
const newName = `mae.b-${RUN}`;
await own.locator('#username').fill(newName);
await own.getByRole('button', { name: 'Save' }).click();
await own.getByText('Saved. Sign in with').waitFor();
const relog = await page();
await login(relog, newName, 'mae-password-2');
check(true, 'people can change their own username and sign in with it');

// Forgotten password: the admin makes a new one
await admin.goto(BASE + '/admin');
const card = admin.locator('li.card', { hasText: newName });
await card.getByRole('button', { name: 'Reset password' }).click();
const mae2 = await readCredentials(card);
check(mae2.username === newName && mae2.password !== 'mae-password-2', 'the admin can reset a forgotten password and gets the new one to pass on');
await relog.goto(BASE + '/');
check(relog.url().includes('/login'), 'a reset signs them out everywhere');
const oldPw = await page();
await oldPw.goto(BASE + '/login');
await oldPw.fill('#username', newName);
await oldPw.fill('#password', 'mae-password-2');
await oldPw.getByRole('button', { name: 'Sign in' }).click();
await oldPw.getByText('don’t match').waitFor();
check(true, 'the old password stops working');
const back = await acceptInvite(mae2);
check(true, 'the new password works');

// Admin: role change and deactivation
await admin.goto(BASE + '/admin');
await card.locator('select[name=platform_role]').selectOption('creator');
await card.getByRole('button', { name: 'Save' }).click();
await admin.waitForTimeout(500);
await back.goto(BASE + '/events');
check(await back.getByRole('link', { name: 'New event' }).isVisible(), 'promoting to creator lets them create events');
await card.getByRole('button', { name: 'Deactivate' }).click();
await admin.waitForTimeout(500);
await back.goto(BASE + '/');
check(back.url().includes('/login'), 'deactivation signs them out immediately');
const blocked = await page();
await blocked.goto(BASE + '/login');
await blocked.fill('#username', newName);
await blocked.fill('#password', mae2.password);
await blocked.getByRole('button', { name: 'Sign in' }).click();
await blocked.getByText('don’t match').waitFor();
check(true, 'a deactivated account cannot sign in');

// One-time links handed out before usernames still lead somewhere sensible
const stale = await page();
await stale.goto(`${BASE}/album/anything/welcome?token=not-a-real-token`);
check(stale.url().includes('/auth/link?token=not-a-real-token') && (await stale.getByText('This link has already been used').isVisible()), 'an old event invite link goes to the sign-in link page');

// Sign out everywhere
const d1 = await page();
const d2 = await page();
await login(d1, ADMIN.username, ADMIN.password);
await login(d2, ADMIN.username, ADMIN.password);
await d1.goto(BASE + '/account');
await d1.getByRole('button', { name: 'Sign out everywhere' }).click();
await d1.waitForURL(/\/login/);
await d2.goto(BASE + '/');
check(d2.url().includes('/login'), '“Sign out everywhere” ends every session');

// Every sign-in and password handed out is audited with the device
const [{ n }] = await db`SELECT count(*)::int AS n FROM core.audit_log WHERE action = 'login.password' AND device_id IS NOT NULL AND ip IS NOT NULL`;
check(n > 0, 'sign-ins are recorded with device id and IP');
const [{ r }] = await db`SELECT count(*)::int AS r FROM core.audit_log WHERE action = 'people.password.reset'`;
check(r > 0, 'password resets are recorded');
const [{ leaked }] = await db`SELECT count(*)::int AS leaked FROM core.audit_log WHERE detail::text LIKE ${'%' + mae2.password + '%'} OR detail::text LIKE ${'%' + mae1.password + '%'}`;
check(leaked === 0, 'passwords never end up in the audit log');

await finish();
