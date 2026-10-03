// Accounts: sign-in, invites, links, passwords, deactivation, roles.
import { ADMIN, BASE, RUN, acceptInvite, adminPage, check, finish, invite, login, page } from '../lib.mjs';

const anon = await page();
await anon.goto(BASE + '/admin');
check(anon.url().includes('/login?next=%2Fadmin'), 'signed-out visit to /admin goes to sign-in, remembering where to return');

// Wrong password keeps the email and says so; right password returns to ?next
await anon.fill('#email', ADMIN.email);
await anon.fill('#password', 'not-the-password');
await anon.getByRole('button', { name: 'Sign in' }).click();
await anon.getByText('don’t match').waitFor();
check((await anon.inputValue('#email')) === ADMIN.email, 'wrong password: error shown, email kept');
await anon.fill('#password', ADMIN.password);
await anon.getByRole('button', { name: 'Sign in' }).click();
await anon.waitForURL(BASE + '/admin');
check(true, 'right password returns to the page that was asked for');

const admin = await adminPage();
await admin.goto(BASE + '/');
check(await admin.getByRole('heading', { name: 'Events' }).isVisible(), 'admin dashboard lists Events');
check(!(await admin.getByRole('heading', { name: 'Couples' }).isVisible()), 'the Couples app is invisible without an explicit grant, even to admin');
check((await (await admin.goto(BASE + '/couples'))?.status()) === 404, 'Couples is a 404 for admin');

// Invite → link → choose password → sign in with it
const email = `mae-${RUN}@example.com`;
const link = await invite(admin, `Aunt Mae ${RUN}`, email);
check(link.includes('/auth/link?token='), 'invite produces a one-time link');
const scanner = await page();
await scanner.goto(link);
check((await scanner.context().cookies()).filter((c) => c.name === 'i2w2i_session').length === 0, 'opening the link (e.g. an email scanner) does not sign anyone in');
const mae = await acceptInvite(link, 'mae-password-1');
check(true, 'invited member chooses a password on first sign-in');
const reuse = await page();
await reuse.goto(link);
check(await reuse.getByText('This link has expired').isVisible(), 'invite links work once');
await mae.goto(BASE + '/admin');
check(mae.url() === BASE + '/', 'members cannot open the People page');
const again = await page();
await login(again, email.toUpperCase(), 'mae-password-1');
check(true, 'members sign in with email (any case) + password');

// No email set up: the login page doesn't offer emailed links, and says how to get back in
const forgot = await page();
await forgot.goto(BASE + '/login');
check(!(await forgot.getByRole('button', { name: 'Email me a link' }).isVisible()), 'without email, the login page doesn’t offer emailed links');
check(await forgot.getByText('Ask the person who invited you (or Eric) for a new sign-in link').isVisible(), '…and tells people how to get back in');

// Password change signs out other devices
await mae.goto(BASE + '/account');
await mae.fill('#current', 'mae-password-1');
await mae.fill('#password', 'mae-password-2');
await mae.fill('#confirm', 'mae-password-2');
await mae.getByRole('button', { name: 'Change password' }).click();
await mae.getByText('Password saved.').waitFor();
await again.goto(BASE + '/');
check(again.url().includes('/login'), 'changing the password signs out other devices');
await mae.goto(BASE + '/');
check(mae.url() === BASE + '/', '…but not the device that changed it');

// Admin: role change and deactivation
await admin.goto(BASE + '/admin');
const card = admin.locator('li.card', { hasText: email });
await card.locator('select[name=platform_role]').selectOption('creator');
await card.getByRole('button', { name: 'Save' }).click();
await admin.waitForTimeout(500);
await mae.goto(BASE + '/events');
check(await mae.getByRole('link', { name: 'New event' }).isVisible(), 'promoting to creator lets them create events');
await card.getByRole('button', { name: 'Deactivate' }).click();
await admin.waitForTimeout(500);
await mae.goto(BASE + '/');
check(mae.url().includes('/login'), 'deactivation signs them out immediately');
const blocked = await page();
await blocked.goto(BASE + '/login');
await blocked.fill('#email', email);
await blocked.fill('#password', 'mae-password-2');
await blocked.getByRole('button', { name: 'Sign in' }).click();
await blocked.getByText('don’t match').waitFor();
check(true, 'a deactivated account cannot sign in');

// Sign out everywhere
const d1 = await page();
const d2 = await page();
await login(d1, ADMIN.email, ADMIN.password);
await login(d2, ADMIN.email, ADMIN.password);
await d1.goto(BASE + '/account');
await d1.getByRole('button', { name: 'Sign out everywhere' }).click();
await d1.waitForURL(/\/login/);
await d2.goto(BASE + '/');
check(d2.url().includes('/login'), '“Sign out everywhere” ends every session');

// Every sign-in is audited with the device
const [{ n }] = await (await import('../lib.mjs')).db`SELECT count(*)::int AS n FROM core.audit_log WHERE action = 'login.password' AND device_id IS NOT NULL AND ip IS NOT NULL`;
check(n > 0, 'sign-ins are recorded with device id and IP');

await finish();
