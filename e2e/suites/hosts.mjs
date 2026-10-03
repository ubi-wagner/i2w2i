// Without email: hosts add people to their event with a username and a
// starting password they pass on themselves, and reset forgotten passwords
// the same way. Only the admin may reset accounts a host didn't create.
import { BASE, RUN, acceptInvite, addToEvent, adminPage, approveAll, check, createCode, createEvent, db, eventInviteForm, finish, fixture, hostInvite, invite, joinWithCode, login, page, phonePage, readCredentials, setAudience, tiles, uploadFiles } from '../lib.mjs';

const admin = await adminPage();
const holly = await acceptInvite(await invite(admin, `Holly Host ${RUN}`, `holly-${RUN}`, 'creator'));
const fred = await acceptInvite(await invite(admin, `Fred Family ${RUN}`, `fred-${RUN}`)); // added by the admin, not Holly
const ev = await createEvent(holly, `Hosted ${RUN}`, `hosted-${RUN}`);

// Holly adds a brand-new person straight onto her event
const ninaCreds = await hostInvite(holly, ev, `Nina New ${RUN}`, `nina-${RUN}`);
check(ninaCreds.username === `nina-${RUN}` && ninaCreds.password.split('-').length === 3, 'the host gets a username and starting password to pass on');
const form = eventInviteForm(holly);
check(await form.getByRole('button', { name: 'Copy message' }).isVisible(), '…and a ready-made message to copy');
const [nina] = await db`SELECT platform_role, created_by, email FROM core.users WHERE username = ${`nina-${RUN}`}`;
const [hollyRow] = await db`SELECT id FROM core.users WHERE username = ${`holly-${RUN}`}`;
check(nina?.platform_role === 'member' && nina.created_by === hollyRow.id && nina.email === null, 'the new account is a family member account, created by the host, with no email');
// The message points at the album's sign-in, so they land in the album
const ninaPage = await page();
await ninaPage.goto(`${BASE}/login?next=/album/${ev.slug}`);
await ninaPage.fill('#username', ninaCreds.username);
await ninaPage.fill('#password', ninaCreds.password);
await ninaPage.getByRole('button', { name: 'Sign in' }).click();
await ninaPage.waitForURL(`${BASE}/album/${ev.slug}`);
check(true, 'the new person signs in and lands in the event’s album');
await ninaPage.goto(BASE + '/events');
check(await ninaPage.getByText(`Hosted ${RUN}`).isVisible(), '…and sees the event under Events');

// Typing an existing username never adds (or takes over) that account
await holly.goto(ev.manage);
await form.getByLabel('Name', { exact: true }).fill('Fred');
await form.getByLabel('Username', { exact: true }).fill(`fred-${RUN}`);
await form.getByRole('button', { name: 'Add to this event' }).click();
await form.getByText('Someone already has the username').waitFor();
check(!(await form.getByLabel('Their password').isVisible()), 'a taken username is refused; no account is touched');
// People who already have an account are picked from the list instead
await addToEvent(holly, ev, `Fred Family ${RUN} (fred-${RUN})`);
await fred.goto(BASE + '/events');
check(await fred.getByText(`Hosted ${RUN}`).isVisible(), 'an existing account added from the list now sees the event');

// Resets: Holly can for Nina, not for Fred or the admin
await holly.goto(ev.manage);
const ninaRow = holly.locator('li', { hasText: `nina-${RUN}` });
const fredRow = holly.locator('li', { hasText: `fred-${RUN}` });
check(await ninaRow.getByRole('button', { name: 'Reset password' }).isVisible(), 'a host can reset the password of people they added');
check(!(await fredRow.getByRole('button', { name: 'Reset password' }).isVisible()), '…but not of accounts someone else created');
// Forging the request for someone else is refused too
const [fredDb] = await db`SELECT id FROM core.users WHERE username = ${`fred-${RUN}`}`;
const resetForm = ninaRow.locator('form', { has: holly.getByRole('button', { name: 'Reset password' }) });
await resetForm.locator('input[name=user_id]').evaluate((el, id) => { el.value = id; }, fredDb.id);
await resetForm.getByRole('button', { name: 'Reset password' }).click();
await holly.getByText('Only Eric can reset this person’s password.').waitFor();
check(true, 'a forged reset for someone else is refused');

// Nina forgot her password: Holly gives her a new one
await holly.reload();
const ninaRow2 = holly.locator('li', { hasText: `nina-${RUN}` });
await ninaRow2.getByRole('button', { name: 'Reset password' }).click();
const ninaNew = await readCredentials(ninaRow2);
check(ninaNew.username === `nina-${RUN}` && ninaNew.password !== ninaCreds.password, 'the host gets Nina’s new password to pass on');
await ninaPage.goto(BASE + '/');
check(ninaPage.url().includes('/login'), 'the reset signed out her other devices');
const oldTry = await page();
await oldTry.goto(BASE + '/login');
await oldTry.fill('#username', `nina-${RUN}`);
await oldTry.fill('#password', ninaCreds.password);
await oldTry.getByRole('button', { name: 'Sign in' }).click();
await oldTry.getByText('don’t match').waitFor();
check(true, 'the old password no longer works');
const ninaPhone = await acceptInvite(ninaNew);
check(true, 'the new one does');
await ninaPhone.goto(BASE + '/account');
check(await ninaPhone.locator('#current').isVisible(), 'changing it herself asks for the current password (the one she was given)');

// The admin can reset anyone (e.g. Fred), from People
await admin.goto(BASE + '/admin');
const fredCard = admin.locator('li.card', { hasText: `fred-${RUN}` });
await fredCard.getByRole('button', { name: 'Reset password' }).click();
const fredNew = await readCredentials(fredCard);
await acceptInvite(fredNew);
check(fredNew.username === `fred-${RUN}`, 'the admin can reset anyone’s password');

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
const sashaCreds = await hostInvite(holly, ev, `Sasha Cohost ${RUN}`, `sasha-${RUN}`, 'owner');
check(sashaCreds.username === `sasha-${RUN}` && sashaCreds.password !== ninaCreds.password, 'a second person shows their own username and password, never the previous one’s');
const sasha = await acceptInvite(sashaCreds);
await sasha.goto(`${BASE}/album/${ev.slug}`);
await sasha.getByRole('link', { name: 'Manage' }).click();
await sasha.waitForURL(ev.manage);
check(await sasha.getByText('Add someone new').isVisible(), 'a co-host can open the manage page and add people');
// …and change someone's role: Fred becomes a helper
const fredOnSasha = sasha.locator('li', { hasText: `fred-${RUN}` });
await fredOnSasha.getByLabel(/role$/).selectOption('curator');
await fredOnSasha.getByRole('button', { name: 'Save' }).click();
await sasha.waitForLoadState('networkidle');
const [fredRole] = await db`SELECT m.role FROM events.members m JOIN core.users u ON u.id = m.user_id WHERE m.event_id = ${ev.id} AND u.username = ${`fred-${RUN}`}`;
check(fredRole?.role === 'curator', 'a co-host can change someone’s role on the event');
// …and, though only a family-member account, reset people she added (a lost password)
await hostInvite(sasha, ev, `Pia ${RUN}`, `pia-${RUN}`);
await sasha.reload();
const piaRow = sasha.locator('li', { hasText: `pia-${RUN}` });
await piaRow.getByRole('button', { name: 'Reset password' }).click();
check((await readCredentials(piaRow)).username === `pia-${RUN}`, 'a co-host who is a family member can reset someone she added');
check(!(await sasha.locator('li', { hasText: `fred-${RUN}` }).getByRole('button', { name: 'Reset password' }).isVisible()), '…but not anyone else');

// The co-host runs the day: makes a table code, approves a guest's photo and publishes the album
await createCode(sasha, ev, `TBL${RUN}`.slice(0, 12).toUpperCase());
check(true, 'a co-host makes a table code and QR card');
const tableGuest = await phonePage();
await joinWithCode(tableGuest, ev.slug, 'Table Guest', `TBL${RUN}`.slice(0, 12));
await uploadFiles(tableGuest, [fixture('portrait.jpg')]);
await setAudience(sasha, ev, 'published', 'public');
check(true, 'a co-host publishes the album');
const outsider = await page();
await outsider.goto(`${BASE}/album/${ev.slug}`);
check((await tiles(outsider).count()) === 0, 'the guest’s photo stays private until a host approves it');
await approveAll(sasha, ev);
await outsider.reload();
check((await tiles(outsider).count()) === 1, 'the co-host approves it and the public album shows it');
await finish();
