// Comments on photos and gift links.
import { BASE, RUN, adminPage, approveAll, check, createCode, createEvent, finish, fixture, joinWithCode, phonePage, setAudience, tiles, uploadFiles } from '../lib.mjs';

const slug = `social-${RUN}`;
const host = await adminPage();
const ev = await createEvent(host, `Social ${RUN}`, slug);
await createCode(host, ev, 'SOC1');
await createCode(host, ev, 'SOCUP', { view: false });

// Gift links: Venmo handle and a registry
await host.goto(`${ev.manage}/info`);
await host.getByLabel('Kind of link').selectOption('venmo');
await host.getByLabel('Handle or link').fill('@cassie-b');
await host.getByRole('button', { name: 'Add link' }).click();
await host.getByText('Added.').waitFor();
await host.getByLabel('Kind of link').selectOption('registry');
await host.getByLabel('Handle or link').fill('javascript:alert(1)');
await host.getByRole('button', { name: 'Add link' }).click();
await host.getByText('doesn’t look like').waitFor();
check(true, 'unsafe links are refused');
await host.getByLabel('Handle or link').fill('https://www.zola.com/registry/cassie');
await host.getByRole('button', { name: 'Add link' }).click();
await host.waitForTimeout(600);

const gina = await phonePage();
await joinWithCode(gina, slug, 'Gina', 'SOC1');
await uploadFiles(gina, [fixture('portrait.jpg')]);
await gina.reload();
const gifts = gina.getByRole('region', { name: 'Gifts' });
check(await gifts.getByText('Venmo @cassie-b').isVisible() && (await gifts.locator('svg').count()) === 2, 'album shows the gift links, each with a QR');
check((await gifts.getByRole('link', { name: 'Open' }).first().getAttribute('href')) === 'https://venmo.com/u/cassie-b', 'Venmo handle becomes a Venmo link');

// Comments
await tiles(gina).first().click();
const dialog = gina.getByRole('dialog');
await dialog.getByLabel('Comment').fill('Love this one!');
await dialog.getByRole('button', { name: 'Post' }).click();
await dialog.getByText('Love this one!').waitFor();
check(true, 'guest comments on a photo');
await dialog.getByRole('button', { name: 'Close' }).click();
await gina.reload();
check(await gina.getByText('💬 1').isVisible(), 'grid shows the comment count');

await approveAll(host, ev);
const hal = await phonePage('pixel');
await joinWithCode(hal, slug, 'Hal', 'SOC1');
await tiles(hal).first().click();
await hal.getByRole('dialog').getByText('Love this one!').waitFor();
check(!(await hal.getByRole('dialog').getByRole('button', { name: 'remove' }).isVisible()), 'others can read but not remove someone’s comment');

const up = await phonePage();
await joinWithCode(up, slug, 'Upload Only', 'SOCUP');
const r = await up.request.get(`${BASE}/album/${slug}/api/comments?upload=00000000-0000-0000-0000-000000000000`);
check((await r.json()).canPost === false, 'upload-only guests can’t comment on a private album');

// The host can remove it
await host.goto(`${ev.manage}/photos`);
await host.getByRole('button', { name: 'Open photo from Gina' }).click();
await host.getByRole('dialog').getByRole('button', { name: 'remove' }).click();
await host.waitForTimeout(500);
await gina.reload();
check(!(await gina.getByText('💬 1').isVisible()), 'host removes a comment');

// Public album: the gift links are visible to anyone
await setAudience(host, ev, 'published', 'public');
const anon = await phonePage();
await anon.goto(`${BASE}/album/${slug}`);
check(await anon.getByRole('region', { name: 'Gifts' }).isVisible(), 'public album shows gift links to everyone');
await finish();
