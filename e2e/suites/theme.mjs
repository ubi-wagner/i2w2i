// Event looks: the host picks a theme and a gift note; guests see them on
// the QR landing page, the album and the printed cards.
import { RUN, adminPage, check, createCode, createEvent, finish, phonePage } from '../lib.mjs';

const host = await adminPage();
const ev = await createEvent(host, `Cassie & Jordan ${RUN}`, `wedding-${RUN}`);
await host.goto(ev.manage);
await host.fill('#starts_on', '2026-10-17');
await host.fill('#location', 'Strauss Creek Farm');
await host.locator('label', { hasText: 'Enchanted forest' }).click();
await host.fill('#gift_note', 'Your presence is our gift. If you’d like to help us start our life together…');
await host.getByRole('button', { name: 'Save', exact: true }).first().click();
await host.getByText(/^Saved/).waitFor();
check(await host.locator('input[name=theme][value=woodland]').isChecked(), 'the host picks the Enchanted forest look');

await host.getByLabel('Kind of link').selectOption('venmo');
await host.getByLabel('Handle or link').fill('@cassmblake89');
await host.getByRole('button', { name: 'Add link' }).click();
await host.getByText('Added.').waitFor();
await createCode(host, ev, `WED${RUN}`.slice(0, 12).toUpperCase());

// Printed table card is themed and still has a scannable QR on white
await host.goto(ev.manage);
await host.getByRole('link', { name: 'Print card' }).first().click();
await host.waitForURL(/\/codes\//);
check((await host.locator('[data-theme=woodland]').count()) === 1, 'the printed QR card uses the event’s look');
check(await host.getByText('10 · 17 · 26').isVisible(), '…with the date set like the invitation');

// A guest scans: themed landing page with the couple's names
const guest = await phonePage('iphone');
await guest.goto(ev.manage.replace(/\/events\/.*/, `/album/${ev.slug}`));
check((await guest.locator('[data-theme=woodland]').count()) === 1, 'the guest landing page uses the event’s look');
check(await guest.getByRole('heading', { name: /Cassie/ }).isVisible() && (await guest.locator('.font-script', { hasText: '&' }).count()) === 1, '…with the “&” set in script between the names');
check(await guest.getByText('your name, device and network details are recorded').isVisible(), '…and still tells guests what is recorded');
await guest.fill('#name', 'Aunt June');
await guest.fill('#code', `WED${RUN}`.slice(0, 12).toUpperCase());
await guest.getByRole('button', { name: 'Continue' }).click();
// Same URL as the join form, so wait for the album itself.
await guest.getByRole('link', { name: 'Send a gift' }).waitFor();

// Album: gift note and Venmo button with its QR
const gifts = guest.getByRole('region', { name: 'Gifts' });
check(await guest.getByRole('link', { name: 'Send a gift' }).isVisible(), 'a “Send a gift” link near the top jumps to the gifts');
check(await gifts.getByText('Your presence is our gift.').isVisible(), 'the hosts’ gift note shows above the links');
check((await gifts.getByRole('link', { name: 'Open' }).getAttribute('href')) === 'https://venmo.com/u/cassmblake89', 'the Venmo button opens their Venmo');
check((await gifts.locator('svg').count()) === 1, '…with a QR to scan from another phone');

await finish();
