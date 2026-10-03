// Without email: hosts invite people onto their event and hand out one-time
// links (as text or QR), which also serve as password resets. Only the admin
// may issue links for accounts a host didn't create.
import { BASE, RUN, acceptInvite, adminPage, check, createEvent, db, finish, invite, login, page } from '../lib.mjs';

const admin = await adminPage();
const hostLink = await invite(admin, `Holly Host ${RUN}`, `holly-${RUN}@example.com`, 'creator');
const holly = await acceptInvite(hostLink, 'holly-password-1');
const fredLink = await invite(admin, `Fred Family ${RUN}`, `fred-${RUN}@example.com`); // invited by the admin, not Holly
const fred = await acceptInvite(fredLink, 'fred-password-1');
const ev = await createEvent(holly, `Hosted ${RUN}`, `hosted-${RUN}`);

// Holly invites a brand-new person straight onto her event
await holly.goto(ev.manage);
const form = holly.locator('form', { has: holly.getByText('Invite someone by name and email', { exact: true }) });
await form.getByLabel('Name').fill(`Nina New ${RUN}`);
await form.getByLabel('Email').fill(`nina-${RUN}@example.com`);
await form.getByRole('button', { name: 'Invite' }).click();
const ninaLink = await form.getByLabel('One-time link').inputValue();
check(ninaLink.includes(`/album/${ev.slug}/welcome?token=`), 'host gets a one-time link that opens the event’s own welcome page');
await form.getByRole('button', { name: 'QR' }).click();
check(await form.getByLabel('QR code for the link').locator('svg').isVisible(), '…and can show it as a QR to scan in person');
const [nina] = await db`SELECT platform_role, created_by FROM core.users WHERE email = ${`nina-${RUN}@example.com`}`;
const [hollyRow] = await db`SELECT id FROM core.users WHERE email = ${`holly-${RUN}@example.com`}`;
check(nina?.platform_role === 'member' && nina.created_by === hollyRow.id, 'the new account is a family member account, created by the host');
const ninaPage = await acceptInvite(ninaLink, 'nina-password-1');
await ninaPage.goto(BASE + '/events');
check(await ninaPage.getByText(`Hosted ${RUN}`).isVisible(), 'the invited person sees the event right away');

// Holly adds Fred, who already has an account: no link (not hers to reset)
await holly.goto(ev.manage);
await form.getByLabel('Name').fill('Fred');
await form.getByLabel('Email').fill(`FRED-${RUN}@example.com`);
await form.getByRole('button', { name: 'Invite' }).click();
await form.getByText('already has an account and is now on this event').waitFor();
check(!(await form.getByLabel('One-time link').isVisible()), 'adding an existing account gives no sign-in link to the host');
await fred.goto(BASE + '/events');
check(await fred.getByText(`Hosted ${RUN}`).isVisible(), 'the existing account now sees the event');

// Reset links: Holly can for Nina, not for Fred or the admin
await holly.goto(ev.manage);
const ninaRow = holly.locator('li', { hasText: `nina-${RUN}@example.com` });
const fredRow = holly.locator('li', { hasText: `fred-${RUN}@example.com` });
check(await ninaRow.getByRole('button', { name: 'New sign-in link' }).isVisible(), 'host can make a new sign-in link for people they invited');
check(!(await fredRow.getByRole('button', { name: 'New sign-in link' }).isVisible()), '…but not for accounts someone else created');
// Forging the request for someone else is refused too
const [fredRow2] = await db`SELECT id FROM core.users WHERE email = ${`fred-${RUN}@example.com`}`;
const linkForm = ninaRow.locator('form', { has: holly.getByRole('button', { name: 'New sign-in link' }) });
await linkForm.locator('input[name=user_id]').evaluate((el, id) => { el.value = id; }, fredRow2.id);
await linkForm.getByRole('button', { name: 'New sign-in link' }).click();
await holly.getByText('Only Eric can make a sign-in link for this person.').waitFor();
check(true, 'a forged request for someone else’s link is refused');

// Nina forgot her password: Holly makes her a link; Nina picks a new password without the old one
await holly.reload();
await holly.locator('li', { hasText: `nina-${RUN}@example.com` }).getByRole('button', { name: 'New sign-in link' }).click();
const reset = await holly.locator('li', { hasText: `nina-${RUN}@example.com` }).getByLabel('One-time link').inputValue();
const ninaPhone = await page();
await ninaPhone.goto(reset);
check(await ninaPhone.getByLabel('Choose a new password').isVisible(), 'a reset link opens the event page asking only for a new password');
await ninaPhone.fill('#password', 'short');
await ninaPhone.fill('#confirm', 'short');
await ninaPhone.getByRole('button', { name: 'See the photos' }).click();
await ninaPhone.getByRole('alert').waitFor();
check(await ninaPhone.getByRole('button', { name: 'See the photos' }).isVisible(), 'a too-short password is explained and doesn’t use up the link');
await ninaPhone.fill('#password', 'nina-password-2');
await ninaPhone.fill('#confirm', 'nina-password-2');
await ninaPhone.getByRole('button', { name: 'See the photos' }).click();
await ninaPhone.waitForURL(`${BASE}/album/${ev.slug}`);
check(true, 'choosing the password goes straight into the album');
await login(await page(), `nina-${RUN}@example.com`, 'nina-password-2');
check(true, 'she signs in with the new password');
await ninaPage.goto(BASE + '/');
check(ninaPage.url().includes('/login'), 'resetting signed out her other devices');
const reuse = await page();
await reuse.goto(reset);
check(await reuse.getByText('This link has already been used').isVisible(), 'reset links work once');

// Without a fresh link, changing the password still needs the old one
await ninaPhone.goto(BASE + '/account');
check(await ninaPhone.locator('#current').isVisible(), 'normal password change asks for the current password');

// Admin can make a link for anyone (e.g. Fred), from People
await admin.goto(BASE + '/admin');
await admin.locator('li.card', { hasText: `fred-${RUN}@example.com` }).getByRole('button', { name: 'New sign-in link' }).click();
const fredReset = await admin.locator('li.card', { hasText: `fred-${RUN}@example.com` }).getByLabel('One-time link').inputValue();
check(fredReset.includes('/auth/link?token='), 'admin can make a sign-in link for anyone');
const fredPhone = await page();
await fredPhone.goto(fredReset);
await fredPhone.getByRole('button', { name: 'Continue' }).click();
await fredPhone.waitForURL(/\/account\?reset=1/);
check(!(await fredPhone.locator('#current').isVisible()), 'after the admin’s reset link, no old password is asked for');

// Album card for sharing a public album
await holly.goto(ev.manage);
check(await holly.getByRole('button', { name: 'Copy album link' }).isVisible(), 'manage page has a copyable album link');
await holly.getByRole('link', { name: 'Album card' }).click();
await holly.waitForURL(/\/card$/);
check(await holly.getByText('See the photos').isVisible() && (await holly.locator('svg').count()) > 0, 'album card shows a QR for the album link');

// A member can't invite people onto the event
await fred.goto(ev.manage);
check(!fred.url().endsWith(ev.id), 'members can’t open the manage page to invite');

// Holly makes Sasha a co-host: Sasha then runs the event just like Holly
await holly.goto(ev.manage);
await form.getByLabel('Name').fill(`Sasha Cohost ${RUN}`);
await form.getByLabel('Email').fill(`sasha-${RUN}@example.com`);
await form.getByLabel('Their role').selectOption('owner');
await form.getByRole('button', { name: 'Invite' }).click();
const sasha = await acceptInvite(await form.getByLabel('One-time link').inputValue(), 'sasha-password-1');
check(sasha.url() === `${BASE}/album/${ev.slug}`, 'the co-host chooses a password on the event’s page and lands in the album');
await sasha.getByRole('link', { name: 'Manage' }).click();
await sasha.waitForURL(ev.manage);
check(await sasha.getByText('Invite someone by name and email').isVisible(), 'a co-host can open the manage page and invite people');
// …and change someone's role: Fred becomes a helper
const fredOnSasha = sasha.locator('li', { hasText: `fred-${RUN}@example.com` });
await fredOnSasha.getByLabel(/role$/).selectOption('curator');
await fredOnSasha.getByRole('button', { name: 'Save' }).click();
await sasha.waitForLoadState('networkidle');
const [fredRole] = await db`SELECT m.role FROM events.members m JOIN core.users u ON u.id = m.user_id WHERE m.event_id = ${ev.id} AND u.email = ${`fred-${RUN}@example.com`}`;
check(fredRole?.role === 'curator', 'a co-host can change someone’s role on the event');
await finish();
