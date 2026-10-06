// Named albums inside an event: hosts and editors approve waiting photos
// straight into albums from the photo view, publish the albums, and guests
// browse them under “View albums”. Drafts stay with the hosts, and an album
// never shows anyone a photo the uploads policy wouldn't.
import { BASE, RUN, acceptInvite, adminPage, check, createCode, createEvent, db, finish, fixture, hostInvite, joinWithCode, phonePage, tiles, uploadFiles } from '../lib.mjs';

const slug = `albums-${RUN}`;
const host = await adminPage();
const ev = await createEvent(host, `Albums ${RUN}`, slug);
await createCode(host, ev, 'ALB1');
const tilesIn = (scope) => scope.locator('ul li button[aria-label^="Open"]');
const fastForward = () => db`UPDATE events.uploads SET writable_until = now() - interval '1 second' WHERE event_id = ${ev.id} AND writable_until > now()`;
const albumRow = async (title) => (await db`SELECT id, slug, published_at, cover_upload_id FROM events.albums WHERE event_id = ${ev.id} AND title = ${title}`)[0];
const inAlbum = async (title) => (await db`SELECT count(*)::int AS n FROM events.album_items i JOIN events.albums a ON a.id = i.album_id WHERE a.event_id = ${ev.id} AND a.title = ${title}`)[0].n;

const gina = await phonePage();
await joinWithCode(gina, slug, 'Gina', 'ALB1');
await uploadFiles(gina, [fixture('landscape-gps.jpg'), fixture('portrait.jpg'), fixture('clip.mp4')]);

// A draft album, made on the Albums tab
await host.goto(`${ev.manage}/albums`);
check(await host.getByRole('link', { name: 'Albums', exact: true }).getAttribute('aria-current') === 'page', 'the Albums tab is marked as the current one');
await host.fill('#album_title', 'Ceremony');
await host.fill('#album_description', 'Vows under the old oak');
await host.getByRole('button', { name: 'Make album' }).click();
await host.getByText('Made “Ceremony”').waitFor();
check(await host.locator('li', { hasText: 'Ceremony' }).getByText('Draft').waitFor().then(() => true, () => false), 'a new album starts as a draft');
check((await albumRow('Ceremony'))?.slug === 'ceremony', '…with a web address from its name');

// Review from the photo view: pick albums, approve, next one comes up
await fastForward();
await host.goto(`${ev.manage}/photos`);
const review = host.locator('#review');
check(await review.getByRole('heading', { name: 'Waiting for your OK (3)' }).isVisible(), 'three uploads wait for the host');
await tilesIn(review).first().click();
const panel = host.getByRole('region', { name: 'Waiting for your OK', exact: true });
await panel.waitFor();
check(await panel.getByRole('button', { name: 'Approve ✓' }).isVisible(), 'the photo view has an approve button for a waiting photo');
await panel.getByRole('button', { name: 'Ceremony', exact: true }).click();
check(await panel.getByRole('button', { name: '✓ Ceremony' }).getAttribute('aria-pressed') === 'true', 'picking an album marks it');
await panel.getByRole('button', { name: 'Approve & post to the album' }).click();
await host.getByText('Approved and posted to the album.').waitFor();
check(await inAlbum('Ceremony') === 1, 'approve & post files the photo into the album');
// A new album right from the review panel
await panel.waitFor();
await panel.getByRole('button', { name: '+ New album' }).click();
await panel.getByLabel('New album name').fill('Reception');
await panel.getByRole('button', { name: 'Make', exact: true }).click();
await panel.getByRole('button', { name: '✓ Reception' }).waitFor();
check(true, 'a new album made from the review panel is picked straight away');
await panel.getByRole('button', { name: 'Approve & post to the album' }).click();
await host.getByText('Approved and posted to the album.').waitFor();
check(await inAlbum('Reception') === 1, '…and the photo goes into it');
await panel.waitFor();
await panel.getByRole('button', { name: 'Approve ✓' }).click();
await review.waitFor({ state: 'detached' });
check((await db`SELECT count(*)::int AS n FROM events.uploads WHERE event_id = ${ev.id} AND approved_at IS NULL`)[0].n === 0, 'approving with no album picked just approves it; the queue empties');

// Drafts are the hosts' alone
await gina.reload();
check(!(await gina.getByRole('link', { name: 'View albums' }).isVisible()), 'no “View albums” while every album is a draft');
check((await gina.goto(`${BASE}/album/${slug}/a/ceremony`)).status() === 404, 'a draft album’s address is not found for guests');

// Publishing lists it under “View albums”
await host.goto(`${ev.manage}/albums`);
await host.locator('li', { hasText: 'Ceremony' }).getByRole('button', { name: 'Publish' }).click();
await host.locator('li', { hasText: 'Ceremony' }).getByText('Published').waitFor();
check((await albumRow('Ceremony')).published_at !== null, 'publish sets the album live');
await gina.goto(`${BASE}/album/${slug}`);
check(await gina.getByRole('link', { name: 'View albums' }).isVisible(), 'guests get “View albums” once one is published');
const index = gina.getByRole('region', { name: 'Albums', exact: true });
check(await index.getByRole('link', { name: /Ceremony/ }).isVisible() && !(await index.getByText('Reception').isVisible()), 'the index lists published albums only');
const [first] = await db`SELECT u.kind, u.preview_key FROM events.album_items i JOIN events.uploads u ON u.id = i.upload_id JOIN events.albums a ON a.id = i.album_id WHERE a.event_id = ${ev.id} AND a.title = 'Ceremony'`;
check(await index.getByRole('link', { name: /Ceremony/ }).locator('img').count() === (first.kind === 'photo' || first.preview_key ? 1 : 0), '…with a cover picture (its photo)');
await index.getByRole('link', { name: /Ceremony/ }).click();
await gina.waitForURL(`${BASE}/album/${slug}/a/ceremony`);
check(await gina.getByRole('heading', { name: 'Ceremony' }).isVisible() && await gina.getByText('Vows under the old oak').isVisible(), 'the album page has its name and words');
check((await tiles(gina).count()) === 1, '…and just its photos');
check(!(await gina.getByRole('button', { name: 'Use as album cover' }).count()), 'guests get no album tools');

// Filing approved photos from the master grid
await host.goto(`${ev.manage}/photos`);
const grid = host.locator('#photos');
await tilesIn(grid).nth(0).click();
const chips = host.getByRole('group', { name: 'Albums' });
await chips.waitFor();
for (let i = 0; i < 3 && (await chips.getByRole('button', { name: '✓ Ceremony' }).count()); i++) {
  await host.getByRole('button', { name: 'Next →' }).click();
}
await chips.getByRole('button', { name: '+ Ceremony' }).click();
await host.getByText('Posted to the album.').waitFor();
check(await inAlbum('Ceremony') === 2, 'an approved photo is posted to an album from the photo view');
await host.getByRole('button', { name: 'Close' }).click();
await gina.reload();
check((await tiles(gina).count()) === 2, '…and guests see it there');

// A waiting photo filed into a published album still isn't shown to guests
await gina.goto(`${BASE}/album/${slug}`);
await uploadFiles(gina, [fixture('portrait.jpg')]);
const [late] = await db`SELECT id FROM events.uploads WHERE event_id = ${ev.id} AND approved_at IS NULL AND status = 'ready'`;
const cer = await albumRow('Ceremony');
await db`INSERT INTO events.album_items (album_id, upload_id, event_id) VALUES (${cer.id}, ${late.id}, ${ev.id})`;
const hal = await phonePage('pixel');
await joinWithCode(hal, slug, 'Hal', 'ALB1');
await hal.goto(`${BASE}/album/${slug}/a/ceremony`);
check((await tiles(hal).count()) === 2, 'an unapproved photo in an album stays hidden from guests');
await host.goto(`${BASE}/album/${slug}/a/ceremony`);
check((await tiles(host).count()) === 3, '…while hosts see it there to review');

// Hosts review and file from the album pages too
await tiles(host).last().click();
const onAlbum = host.getByRole('region', { name: 'Waiting for your OK', exact: true });
await onAlbum.waitFor();
check(await onAlbum.isVisible(), 'a waiting photo can be approved while clicking through the album');
await fastForward();
await host.reload();
await tiles(host).last().click();
await host.getByRole('region', { name: 'Waiting for your OK', exact: true }).getByRole('button', { name: 'Approve ✓' }).click();
await host.getByText('Approved.', { exact: true }).waitFor();
await hal.reload();
check((await tiles(hal).count()) === 3, '…and once approved, guests see it in the album');

// Cover and taking out, on the album's page
await host.reload();
await tiles(host).first().click();
await host.getByRole('button', { name: 'Use as album cover' }).click();
await host.getByText('Album cover set.').waitFor();
check((await albumRow('Ceremony')).cover_upload_id !== null, 'a host picks the album’s cover');
await host.getByRole('button', { name: 'Take out of this album' }).click();
await host.getByText(/^Took out 1 item/).waitFor();
check(await inAlbum('Ceremony') === 2, 'a host takes a photo out of the album');
check((await albumRow('Ceremony')).cover_upload_id === null, '…and a photo taken out stops being the cover');
await host.getByRole('button', { name: 'Close' }).click();
await hal.goto(`${BASE}/album/${slug}`);
check((await tiles(hal).count()) === 4, 'taking a photo out of an album leaves it in the event’s photos');

// The manage page for one album: bulk add, publish state, settings
await host.goto(`${ev.manage}/albums/${(await albumRow('Reception')).id}`);
check(await host.getByRole('heading', { name: 'In this album (1)' }).isVisible(), 'the album’s manage page lists what’s in it');
const add = host.locator('#add-photos');
await add.getByRole('button', { name: 'Select', exact: true }).click();
await add.getByRole('button', { name: 'All', exact: true }).click();
check(!(await add.getByRole('button', { name: 'Delete', exact: true }).count()), 'picking photos for an album shows no moderation buttons');
await add.getByRole('button', { name: /^Add \d+ to “Reception”$/ }).click();
await host.getByRole('heading', { name: 'In this album (4)' }).waitFor();
await add.getByText('Every photo is already in this album.').waitFor();
check(await inAlbum('Reception') === 4 && await add.getByText('Added 3 items.').isVisible(), 'bulk “Add to album” files every selected photo, and says so');
await host.fill('#title', 'Party');
await host.getByRole('button', { name: 'Save name' }).click();
await host.getByText('Saved.', { exact: true }).waitFor();
check((await albumRow('Party'))?.slug === 'reception', 'renaming keeps the address, so shared links still work');
await host.getByRole('button', { name: 'Publish album' }).click();
await host.getByRole('button', { name: 'Unpublish' }).waitFor();

// Order on the index follows the Albums tab
await host.goto(`${ev.manage}/albums`);
await host.getByRole('button', { name: 'Move Party up' }).click();
await host.waitForTimeout(800);
await hal.goto(`${BASE}/album/${slug}`);
const order = await hal.getByRole('region', { name: 'Albums', exact: true }).getByRole('link').allInnerTexts();
check(/^Party/.test(order[0] ?? '') && /^Ceremony/.test(order[1] ?? ''), 'guests see albums in the hosts’ order');

// Editors run albums too; viewers only see published ones
const edCreds = await hostInvite(host, ev, `Eddie Editor ${RUN}`, `eddie-${RUN}`, 'curator');
await host.goto(ev.manage);
const vicCreds = await hostInvite(host, ev, `Vic Viewer ${RUN}`, `vic-${RUN}`, 'invitee');
const eddie = await acceptInvite(edCreds);
await eddie.goto(`${ev.manage}/albums`);
check(!(await eddie.getByRole('link', { name: 'QR & posters' }).count()), 'an editor has no QR & posters tab');
await eddie.fill('#album_title', 'First dance');
await eddie.getByRole('button', { name: 'Make album' }).click();
await eddie.getByText('Made “First dance”').waitFor();
check(Boolean(await albumRow('First dance')), 'an editor makes an album');
const vic = await acceptInvite(vicCreds);
await vic.goto(`${BASE}/album/${slug}`);
check(!(await vic.getByRole('region', { name: 'Albums', exact: true }).getByText('First dance').count()), 'a viewer doesn’t see a draft');
check((await vic.goto(`${BASE}/album/${slug}/a/first-dance`)).status() === 404, '…not even by its address');
await vic.goto(`${ev.manage}/albums`);
check(vic.url() === `${BASE}/album/${slug}`, 'a viewer is sent from the manage pages to the album');
await eddie.locator('li', { hasText: 'First dance' }).getByRole('button', { name: 'Publish' }).click();
await eddie.locator('li', { hasText: 'First dance' }).getByText('Published').waitFor();
// An empty album isn't listed even when published
await vic.goto(`${BASE}/album/${slug}`);
check(!(await vic.getByRole('region', { name: 'Albums', exact: true }).getByText('First dance').count()), 'a published album with no photos isn’t listed yet');
check((await vic.goto(`${BASE}/album/${slug}/a/first-dance`)).status() === 200, '…but its page opens');

// An album can be its own public page: anyone with the link, while the event stays private
const stranger = await phonePage();
await stranger.goto(`${BASE}/album/${slug}/a/ceremony`);
check(stranger.url() === `${BASE}/album/${slug}`, 'a private album’s link sends a stranger to the join page');
await host.goto(`${ev.manage}/albums/${(await albumRow('Ceremony')).id}`);
await host.getByRole('radio', { name: /^Public/ }).check();
await host.getByText('Saved: anyone with the link can see it.').waitFor();
check((await db`SELECT audience FROM events.albums WHERE event_id = ${ev.id} AND title = 'Ceremony'`)[0].audience === 'public', 'a host makes an album public');
await host.reload();
check(await host.getByRole('radio', { name: /^Public/ }).isChecked() && await host.getByRole('button', { name: 'Copy link' }).isVisible(), '…it stays public, with its own link to share');
const publicPhotos = (await db`SELECT count(*)::int AS n FROM events.album_items i JOIN events.uploads u ON u.id = i.upload_id JOIN events.albums a ON a.id = i.album_id
  WHERE a.event_id = ${ev.id} AND a.title = 'Ceremony' AND u.approved_at IS NOT NULL AND NOT u.hidden`)[0].n;
await stranger.goto(`${BASE}/album/${slug}`);
const openAlbums = stranger.getByRole('region', { name: 'Albums', exact: true });
check(await openAlbums.getByRole('link', { name: /Ceremony/ }).isVisible() && !(await openAlbums.getByText('Party').count()), 'the event’s page lists the public album to anyone, and only that one');
check(await stranger.getByLabel('Album code').isVisible(), '…while the event itself still asks for a code');
await openAlbums.getByRole('link', { name: /Ceremony/ }).click();
await stranger.waitForURL(`${BASE}/album/${slug}/a/ceremony`);
check(publicPhotos > 0 && (await tiles(stranger).count()) === publicPhotos, `anyone with the link sees the public album’s approved photos (${publicPhotos})`);
check(!(await stranger.getByRole('button', { name: 'Select', exact: true }).count()), '…without downloads');
check(await stranger.getByRole('button', { name: 'Slideshow', exact: true }).isVisible(), '…and can play it as a slideshow');
await tiles(stranger).first().click();
check(!(await stranger.getByPlaceholder('Add a comment…').count()), '…but not read or write comments');
await stranger.getByRole('button', { name: 'Close' }).click();
await host.getByRole('radio', { name: /^Private/ }).check();
await host.getByText('Saved: only people who can see the event.').waitFor();
await stranger.goto(`${BASE}/album/${slug}/a/ceremony`);
check(stranger.url() === `${BASE}/album/${slug}`, 'made private again, its link asks for the code');

// Unpublish and delete
await host.goto(`${ev.manage}/albums`);
await host.locator('li', { hasText: 'Ceremony' }).getByRole('button', { name: 'Unpublish' }).click();
await host.locator('li', { hasText: 'Ceremony' }).getByText('Draft').waitFor();
await hal.goto(`${BASE}/album/${slug}`);
check(!(await hal.getByRole('region', { name: 'Albums', exact: true }).getByText('Ceremony').count()), 'unpublishing takes it off the index');
host.once('dialog', (d) => d.accept());
await host.locator('li', { hasText: 'Party' }).getByRole('button', { name: 'Delete album' }).click();
await host.locator('li', { hasText: 'Party' }).waitFor({ state: 'detached' });
check(!(await albumRow('Party')), 'deleting an album removes it');
check((await db`SELECT count(*)::int AS n FROM events.uploads WHERE event_id = ${ev.id} AND status = 'ready'`)[0].n === 4, '…and leaves its photos in the event');
const acts = (await db`SELECT action FROM events.activity WHERE event_id = ${ev.id}`).map((r) => r.action);
check(['album.create', 'album.publish', 'album.unpublish', 'album.delete', 'album.add', 'album.audience', 'upload.approve'].every((a) => acts.includes(a)), 'album changes are in the activity log');
await finish();
