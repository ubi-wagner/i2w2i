// Event pages: the host picks a look and writes the page (invitation
// wording, directions, schedule, notes, gift note); guests see it on the
// QR landing page, the album and the printed cards.
import { RUN, adminPage, check, createCode, createEvent, finish, phonePage } from '../lib.mjs';

const host = await adminPage();
const ev = await createEvent(host, `Cassie & Jordan ${RUN}`, `wedding-${RUN}`);
const ADDRESS = '1600 Amphitheatre Parkway, Mountain View, CA';
await host.goto(ev.manage);
const editor = host.locator('#page');
await editor.locator('label', { hasText: 'Enchanted forest' }).click();
await editor.getByRole('button', { name: 'Use wedding wording' }).click();
check((await host.inputValue('#kicker')) === 'With great joy', '“Use wedding wording” fills the invitation lines');
await host.fill('#kicker', 'With so much love');
await host.fill('#starts_on', '2026-10-17');
await host.fill('#location', 'Strauss Creek Farm');
await host.fill('#address', ADDRESS);
await editor.getByRole('button', { name: '+ Add to schedule' }).click();
await editor.getByLabel('Time 1').fill('4:00 PM');
await editor.getByLabel('What 1').fill('Ceremony');
await editor.getByLabel('Where 1').fill('The meadow');
await editor.getByRole('button', { name: '+ Add to schedule' }).click();
await editor.getByLabel('Time 2').fill('5:30 PM');
await editor.getByLabel('What 2').fill('Dinner & dancing');
await editor.getByRole('button', { name: 'Move item 2 up' }).click();
check((await editor.getByLabel('What 1').inputValue()) === 'Dinner & dancing', 'schedule rows can be reordered');
await editor.getByRole('button', { name: 'Move item 1 down' }).click();
await editor.getByRole('button', { name: '+ Add a note' }).click();
await editor.getByLabel('Topic 1').fill('Dress code');
await editor.getByLabel('Details 1').fill('Cocktail attire. Flats for the grass!');
await host.fill('#gift_note', 'Your presence is our gift. If you’d like to help us start our life together…');
check(await editor.getByRole('complementary', { name: 'Preview' }).getByRole('img', { name: 'With so much love' }).isVisible(), 'the preview updates as the host types');
check(await editor.getByText('Unsaved changes').isVisible(), 'unsaved changes are flagged');
await editor.getByRole('button', { name: 'Save page' }).click();
await editor.getByText('Saved. Guests see it now.').waitFor();
await host.reload();
check(await host.locator('input[name=theme][value=woodland]').isChecked() && (await host.inputValue('#address')) === ADDRESS, 'the page is saved (look and address survive a reload)');

await host.getByLabel('Kind of link').selectOption('venmo');
await host.getByLabel('Handle or link').fill('@cassmblake89');
await host.getByRole('button', { name: 'Add link' }).click();
await host.getByText('Added.').waitFor();
const CODE = `WED${RUN}`.slice(0, 12).toUpperCase();
await createCode(host, ev, CODE);

// Printed table card is themed and still has a scannable QR on white
await host.goto(ev.manage);
await host.getByRole('link', { name: 'Print card' }).first().click();
await host.waitForURL(/\/codes\//);
check((await host.locator('[data-theme=woodland]').count()) === 1, 'the printed QR card uses the event’s look');
check(await host.getByText('10 · 17 · 26').isVisible(), '…with the date set like the invitation');

// A guest arrives: themed landing page, invitation wording, but no address yet
const guest = await phonePage('iphone');
await guest.goto(ev.manage.replace(/\/events\/.*/, `/album/${ev.slug}`));
check((await guest.locator('[data-theme=woodland]').count()) === 1, 'the guest landing page uses the event’s look');
check(await guest.getByRole('heading', { name: /Cassie/ }).isVisible() && (await guest.locator('.font-script', { hasText: '&' }).count()) === 1, '…with the “&” set in script between the names');
check(await guest.getByRole('img', { name: 'With so much love' }).isVisible() && await guest.getByText('Reception to follow').isVisible(), '…and the hosts’ invitation wording');
check(!(await guest.content()).includes('Amphitheatre') && !(await guest.getByRole('button', { name: 'Directions' }).isVisible()), 'the address and schedule stay hidden until they join');
check(await guest.getByText('your name, device and network details are recorded').isVisible(), '…and it still tells guests what is recorded');
await guest.fill('#name', 'Aunt June');
await guest.fill('#code', CODE);
await guest.getByRole('button', { name: 'Continue' }).click();
await guest.getByRole('button', { name: 'Directions' }).waitFor();

// Directions sheet: map apps
await guest.getByRole('button', { name: 'Directions' }).click();
const dir = guest.getByRole('dialog', { name: 'Directions' });
await dir.waitFor();
check((await dir.getByRole('link', { name: 'Directions in Google Maps' }).getAttribute('href')).startsWith('https://www.google.com/maps/dir/?api=1&destination=1600%20Amphitheatre'), 'Directions opens Google Maps with the address');
check((await dir.getByRole('link', { name: 'Apple Maps' }).getAttribute('href')).startsWith('https://maps.apple.com/?daddr=') && await dir.getByRole('link', { name: 'Waze' }).isVisible(), '…or Apple Maps or Waze');
check(await dir.locator('iframe[title^="Map of"]').count() === 1, '…with a map');
await dir.getByRole('button', { name: 'Close' }).click();
check(!(await dir.isVisible()), 'the sheet closes');

// Schedule and notes
await guest.getByRole('button', { name: 'Schedule' }).click();
const sch = guest.getByRole('dialog', { name: 'Schedule' });
check(await sch.getByText('Ceremony').isVisible() && await sch.getByText('4:00 PM').isVisible() && await sch.getByText('The meadow').isVisible(), 'Schedule shows the hosts’ times and places in order');
await guest.keyboard.press('Escape');
await guest.getByRole('button', { name: 'Good to know' }).click();
check(await guest.getByRole('dialog', { name: 'Good to know' }).getByText('Flats for the grass!').isVisible(), '“Good to know” shows the hosts’ notes');
await guest.keyboard.press('Escape');

// Gifts sheet: note and Venmo with its QR
await guest.getByRole('button', { name: 'Send a gift' }).click();
const gifts = guest.getByRole('dialog', { name: 'Send a gift' });
check(await gifts.getByText('Your presence is our gift.').isVisible(), 'the gift sheet shows the hosts’ note');
check((await gifts.getByRole('link', { name: 'Open' }).getAttribute('href')) === 'https://venmo.com/u/cassmblake89', '…and the Venmo button opens their Venmo');
check((await gifts.locator('li svg').count()) === 1, '…with a QR to scan from another phone');

await finish();
