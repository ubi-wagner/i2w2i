// The album slideshow: settings, full screen, timing, order, fade and
// borders; Esc or a tap goes back; only approved, visible photos go up on
// the big screen, and new ones join while it runs.
import { readFileSync } from 'node:fs';
import { BASE, RUN, adminPage, approveAll, check, createCode, createEvent, db, finish, fixture, joinWithCode, phonePage, uploadFiles } from '../lib.mjs';

const slug = `slides-${RUN}`;
const host = await adminPage();
const ev = await createEvent(host, `Slides ${RUN}`, slug);
await createCode(host, ev, 'SLIDE1');
await createCode(host, ev, 'SLIDEUP', { view: false });
const photo = readFileSync(fixture('landscape-gps.jpg'));
const jpg = (name) => ({ name, mimeType: 'image/jpeg', buffer: photo });

const gina = await phonePage();
await joinWithCode(gina, slug, 'Gina', 'SLIDE1');
await uploadFiles(gina, [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg'), { name: 'clip.mp4', mimeType: 'video/mp4', buffer: readFileSync(fixture('clip.mp4')) }]);
await approveAll(host, ev);
await db`UPDATE events.uploads SET hidden = true WHERE event_id = ${ev.id} AND filename = 'c.jpg'`;
await uploadFiles(gina, [jpg('d.jpg')]); // waits for the hosts
const idOf = async (name) => (await db`SELECT id FROM events.uploads WHERE event_id = ${ev.id} AND filename = ${name}`)[0].id;

const show = (p) => p.getByRole('dialog', { name: 'Slideshow', exact: true });
const player = (p) => p.locator('[role=dialog][aria-label=Slideshow][data-slides]');
const shownId = (p) => player(p).locator('img[data-current]').evaluate((img) => img.getAttribute('src'));
// Full screen comes and goes a moment after it's asked for.
const fullscreen = (p, want = true) => p.waitForFunction((w) => Boolean(document.fullscreenElement) === w, want, { timeout: 5000 }).then(() => true, () => false);
const pick = (p, label) => show(p).locator('label', { hasText: new RegExp(`^${label}$`) }).click();

// A host starts it from All photos: the settings, then full screen
await host.clock.install();
await host.goto(`${BASE}/album/${slug}`);
await host.getByRole('button', { name: 'Slideshow', exact: true }).click();
await show(host).waitFor();
check(await show(host).getByText('All photos: 2 photos').isVisible(), 'the slideshow counts only approved, visible photos, even for a host');
const checked = (p, name) => show(p).locator(`input[name=${name}]:checked`).evaluate((i) => i.value);
check((await checked(host, 'every')) === '5' && (await checked(host, 'order')) === 'order' && (await checked(host, 'transition')) === 'fade' && (await checked(host, 'border')) === 'none',
  'it starts on the usual settings: every 5 seconds, in order, fade, no border');
await pick(host, '3 seconds');
await pick(host, 'Thin');
await show(host).getByRole('button', { name: 'Start slideshow' }).click();
await player(host).waitFor();
check(await fullscreen(host), 'it goes full screen');
check(await player(host).getAttribute('data-slides') === '2', '…with the two photos everyone can see (not the hidden one, the waiting one or the video)');
check(await player(host).getAttribute('data-border') === 'thin' && await player(host).getAttribute('data-transition') === 'fade', '…bordered and fading as picked');
check(await player(host).getByText('Tap the screen or press Esc to go back').isVisible(), '…and says how to get back');
const ids = [await idOf('a.jpg'), await idOf('b.jpg')];
const first = await shownId(host);
await host.clock.runFor(3500);
await host.waitForFunction((s) => document.querySelector('img[data-current]')?.getAttribute('src') !== s, first);
const second = await shownId(host);
check(second !== first, 'after 3 seconds the next photo comes up');
await host.clock.runFor(3500);
await host.waitForFunction((s) => document.querySelector('img[data-current]')?.getAttribute('src') !== s, second);
check((await shownId(host)) === first, '…and it goes round again');
await host.keyboard.press('ArrowRight');
check((await shownId(host)) === second, 'the arrow keys step through');

// New photos join while it runs
await approveAll(await adminPage(), ev); // from another window
await host.clock.runFor(31000);
await host.waitForFunction(() => document.querySelector('[data-slides]')?.getAttribute('data-slides') === '3', null, { timeout: 15000 }).catch(() => {});
check(await player(host).getAttribute('data-slides') === '3', 'a photo approved while it plays joins the slideshow');
check(await fullscreen(host), '…without leaving full screen');

// Esc goes back to the album
await host.keyboard.press('Escape');
await player(host).waitFor({ state: 'detached' });
check(await fullscreen(host, false), 'Esc leaves full screen and goes back to the album');
check(await host.getByRole('heading', { name: 'All photos' }).isVisible(), '…right where it was');
check(await host.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden' && getComputedStyle(document.documentElement).overflow !== 'hidden'), '…and the page scrolls again');

// The settings are remembered on this device; a tap anywhere also goes back
await host.getByRole('button', { name: 'Slideshow', exact: true }).click();
check((await checked(host, 'every')) === '3' && (await checked(host, 'border')) === 'thin', 'the last settings are remembered');
await pick(host, 'Shuffle');
await pick(host, 'No fade');
await pick(host, 'Wide');
await show(host).getByRole('button', { name: 'Start slideshow' }).click();
await player(host).waitFor();
check(await player(host).getAttribute('data-transition') === 'none' && await player(host).getAttribute('data-border') === 'wide', 'no fade and a wide border, when picked');
const seen = new Set([await shownId(host)]);
for (let i = 0; i < 6; i++) {
  const was = await shownId(host);
  await host.clock.runFor(3500);
  await host.waitForFunction((s) => document.querySelector('img[data-current]')?.getAttribute('src') !== s, was);
  seen.add(await shownId(host));
}
check(seen.size === 3, `shuffle shows every photo (${seen.size} of 3)`);
check((await player(host).locator('img').count()) === 1, 'with no fade, one photo at a time');
await player(host).click({ position: { x: 20, y: 20 } });
await player(host).waitFor({ state: 'detached' });
check(await fullscreen(host, false), 'a tap on the screen goes back too');

// A named album plays just its own photos, for guests too
await db`INSERT INTO events.albums (event_id, slug, title, published_at, created_by)
         SELECT ${ev.id}, 'ceremony', 'Ceremony', now(), created_by FROM events.events WHERE id = ${ev.id}`;
const [album] = await db`SELECT id FROM events.albums WHERE event_id = ${ev.id} AND slug = 'ceremony'`;
await db`INSERT INTO events.album_items (album_id, upload_id, event_id) VALUES (${album.id}, ${ids[0]}, ${ev.id}), (${album.id}, ${await idOf('c.jpg')}, ${ev.id})`;
await gina.goto(`${BASE}/album/${slug}/a/ceremony`);
await gina.getByRole('button', { name: 'Slideshow', exact: true }).click();
check(await show(gina).getByText('Ceremony: 1 photo').isVisible(), 'a named album’s slideshow has only its photos (its hidden one left out)');
await show(gina).getByRole('button', { name: 'Start slideshow' }).click();
await player(gina).waitFor();
check(await player(gina).getAttribute('data-slides') === '1', '…and guests can play it');
await gina.keyboard.press('Escape');
await player(gina).waitFor({ state: 'detached' });

// No slideshow where there's no album to see
const ula = await phonePage('pixel');
await joinWithCode(ula, slug, 'Ula', 'SLIDEUP');
check(!(await ula.getByRole('button', { name: 'Slideshow', exact: true }).count()), 'a guest who can only add photos gets no slideshow');
await finish();
