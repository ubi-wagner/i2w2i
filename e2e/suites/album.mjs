// The bridal-shower flow: host sets up, guests join by code and QR on phones,
// a signed-in bridesmaid uploads and chats, the host curates and publishes,
// and every action is on record with device details.
import { BASE, RUN, acceptInvite, addToEvent, adminPage, approveAll, check, createCode, createEvent, db, finish, fixture, invite, joinWithCode, phonePage, setAudience, tiles, uploadFiles } from '../lib.mjs';

const slug = `shower-${RUN}`;
const host = await adminPage();
const beaCreds = await invite(host, `Bea Bridesmaid ${RUN}`, `bea-${RUN}`, 'member', 'bea-password-1');
const ev = await createEvent(host, `Cassie's Shower ${RUN}`, slug);
await addToEvent(host, ev, `Bea Bridesmaid ${RUN} (bea-${RUN})`);
await createCode(host, ev, 'cb-1106', { label: 'Shower guests' });
await host.goto(`${ev.manage}/qr`);
check(await host.getByText('CB1106', { exact: true }).isVisible(), 'owner sees the typed code again (stored encrypted)');
const qrLink = await host.locator('li', { hasText: 'CB1106' }).locator('input[readonly]').inputValue();
check(/\/album\/[a-z0-9-]+\?t=[A-Za-z0-9_-]{43}$/.test(qrLink), 'QR link is shown to copy');
await host.locator('li', { hasText: 'CB1106' }).getByRole('link', { name: 'Print card' }).click();
await host.waitForURL(/\/codes\//);
await host.getByText('enter code').waitFor();
check(await host.getByText('enter code').isVisible() && (await host.locator('svg').count()) > 0, 'printable card shows the QR and the code');

// Guest by code, on an iPhone
const gina = await phonePage();
await gina.goto(`${BASE}/album/${slug}`);
check(await gina.getByText('To keep this album safe').isVisible(), 'guests are told their name, device and network are recorded');
await gina.fill('#name', 'Gina');
await gina.fill('#code', 'WRONG1');
await gina.getByRole('button', { name: 'Continue' }).click();
await gina.getByText('doesn’t match').waitFor();
check((await gina.inputValue('#name')) === 'Gina', 'wrong code: error, name kept');
await joinWithCode(gina, slug, 'Gina', 'Cb1106');
await uploadFiles(gina, [fixture('landscape-gps.jpg'), fixture('portrait.jpg'), fixture('clip.mp4')]);
await gina.reload();
check((await tiles(gina).count()) === 3, 'guest’s photos and video appear in the album');
const thumbs = await gina.locator('main img').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
const bodies = await Promise.all(thumbs.map((s) => gina.request.get(BASE + s).then((r) => r.body())));
check(bodies.every((b) => b.length < 1_000_000 && !b.includes(Buffer.from('Exif')) && !b.includes(Buffer.from('iPhone 15 Pro'))), 'gallery copies are small and carry no metadata (no camera, no GPS)');

// Same phone, different name
await gina.getByRole('button', { name: 'Not you?' }).click();
await gina.locator('#name').waitFor();
await joinWithCode(gina, slug, 'Mystery Guest', 'CB1106');
check(await gina.getByText('Adding as Mystery Guest').isVisible(), 'same phone rejoins under another name');

// Guest by QR
const quinn = await phonePage('pixel');
await quinn.goto(qrLink);
await quinn.fill('#name', 'Quinn');
await quinn.getByRole('button', { name: 'Continue' }).click();
await quinn.waitForURL(`${BASE}/album/${slug}`);
check(await quinn.getByText('Add photos & videos').isVisible(), 'QR guest only gives a name, lands in the album, token gone from the URL');

// Bridesmaid with an account
const bea = await acceptInvite(beaCreds, (await import('../lib.mjs')).PHONES.iphone);
await bea.goto(`${BASE}/album/${slug}`);
check(await bea.getByText(`Adding as Bea Bridesmaid ${RUN}`).isVisible(), 'bridesmaid uploads under her account name');
await uploadFiles(bea, [fixture('portrait.jpg')]);
await bea.getByPlaceholder('Message everyone…').fill('These are so cute!! 💕');
await bea.getByRole('button', { name: 'Send' }).click();
await host.goto(`${BASE}/album/${slug}`);
await host.getByText('These are so cute!! 💕').waitFor({ timeout: 10000 });
await host.getByPlaceholder('Message everyone…').fill('Thanks Bea!');
await host.getByRole('button', { name: 'Send' }).click();
await bea.getByText('Thanks Bea!').waitFor({ timeout: 10000 });
check(true, 'group chat delivers both ways within seconds');

// The host's view of who did what
await host.goto(`${ev.manage}/people`);
const guests = host.locator('section', { has: host.getByRole('heading', { name: /^Guests/ }) });
check(await guests.getByText(/Same device also used: (Gina|Mystery Guest)/).first().isVisible(), 'host is warned that one phone used two names');
await host.goto(`${ev.manage}/activity`);
const activity = host.locator('section', { has: host.getByRole('heading', { name: 'Activity' }) });
check(await activity.getByText('tried a wrong code (“WRONG1”)').isVisible(), 'activity shows the failed code and what was typed');
await host.goto(`${ev.manage}/photos`);
const dialog = host.getByRole('dialog');
let details = '';
for (let i = 0; i < (await host.getByRole('button', { name: 'Open photo from Gina' }).count()); i++) {
  await host.getByRole('button', { name: 'Open photo from Gina' }).nth(i).click();
  await dialog.getByText('Details').click();
  details = await dialog.locator('dl').innerText();
  if (details.includes('landscape-gps.jpg')) break;
  await dialog.getByRole('button', { name: 'Close' }).click();
}
check(details.includes('Apple iPhone 15 Pro') && details.includes('39.96000, -83.00333'), 'photo details show the camera and the location from the original');
check(/iPhone/.test(details) && /IP address/.test(details) && details.includes('Mystery Guest'), 'photo details show device, IP and other names on that phone');
await dialog.getByRole('button', { name: 'Close' }).click();

// Publish publicly: anonymous visitors see it (once the hosts approve), no uploader, no originals
await setAudience(host, ev, 'published', 'public');
check((await host.inputValue('#status')) === 'published' && (await host.inputValue('#audience')) === 'public', 'after saving, the publishing form shows what was saved');
const early = await phonePage();
await early.goto(`${BASE}/album/${slug}`);
check((await tiles(early).count()) === 0, 'public album: nothing shows before the hosts approve it');
await approveAll(host, ev);
const anon = await phonePage();
await anon.goto(`${BASE}/album/${slug}`);
check((await tiles(anon).count()) === 4 && !(await anon.getByText('Add photos & videos').isVisible()), 'public album: anonymous visitors see it but can’t add');
await tiles(anon).first().click();
check(!(await anon.getByText('Download original').isVisible()), 'public viewers never get originals');

// Activity covers everything, with devices
const acts = await db`SELECT DISTINCT action FROM events.activity WHERE event_id = ${ev.id}`;
const have = new Set(acts.map((a) => a.action));
for (const a of ['album.view', 'album.qr_scan', 'guest.join', 'guest.code_failed', 'upload.start', 'upload.complete', 'chat.post']) check(have.has(a), `activity records ${a}`);
const [{ missing }] = await db`SELECT count(*)::int AS missing FROM events.activity WHERE event_id = ${ev.id} AND (device_id IS NULL OR ip IS NULL OR user_agent IS NULL)`;
check(missing === 0, 'every activity record has device id, IP and user agent');

// A venue full of guests shares one network address: successful joins never lock anyone out.
await setAudience(host, ev, 'published', 'invitees');
for (let i = 1; i <= 16; i++) {
  const p = await phonePage(i % 2 ? 'iphone' : 'pixel');
  await joinWithCode(p, slug, `Venue Guest ${i}`, 'CB1106');
  if (!(await p.getByText('Add photos & videos').isVisible())) { check(false, `venue guest ${i} could not join`); break; }
  await p.context().close();
  if (i === 16) check(true, '16 guests on the same network all join (only wrong codes are limited)');
}

await finish();
