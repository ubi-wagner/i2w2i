// Who sees what, for every kind of visitor, in every album state.
import {
  BASE, RUN, acceptInvite, addToEvent, adminPage, approveAll, check, createCode, createEvent, db, finish, fixture, invite,
  joinWithCode, login, page, phonePage, setAudience, tiles, uploadFiles,
} from '../lib.mjs';

const pw = 'matrix-password-1';
const slug = `matrix-${RUN}`;
const user = (n) => `${n}-${RUN}`;

// ── Cast ────────────────────────────────────────────────────────────────────
const admin = await adminPage();
const people = {};
for (const [key, name, role] of [
  ['cara', 'Cara Creator', 'creator'], ['cody', 'Cody Curator', 'member'], ['ivy', 'Ivy Invitee', 'member'],
  ['fay', 'Fay Family', 'member'], ['dan', 'Dan Deactivated', 'member'],
]) {
  people[key] = await acceptInvite(await invite(admin, `${name} ${RUN}`, user(key), role, pw));
}
const { cara, cody, ivy, fay, dan } = people;

const ev = await createEvent(cara, `Matrix ${RUN}`, slug);
await addToEvent(cara, ev, `Cody Curator ${RUN} (${user('cody')})`, 'curator');
await addToEvent(cara, ev, `Ivy Invitee ${RUN} (${user('ivy')})`, 'invitee');
await addToEvent(cara, ev, `Dan Deactivated ${RUN} (${user('dan')})`, 'invitee');
await createCode(cara, ev, `UP${RUN}`, { view: false, label: 'upload only' });
await createCode(cara, ev, `VIEW${RUN}`, { upload: false, label: 'view only' });
await createCode(cara, ev, `BOTH${RUN}`, { label: 'both' });

// Content: Ivy (2), Bo (1), Uma (1)
await ivy.goto(`${BASE}/album/${slug}`);
await uploadFiles(ivy, [fixture('portrait.jpg'), fixture('landscape-gps.jpg')]);
const uma = await phonePage('pixel');
await joinWithCode(uma, slug, 'Uma Uploader', `up${RUN}`);
await uploadFiles(uma, [fixture('portrait.jpg')]);
const vic = await phonePage();
await joinWithCode(vic, slug, 'Vic Viewer', `VIEW-${RUN}`);
const bo = await phonePage();
await joinWithCode(bo, slug, 'Bo Both', `BOTH${RUN}`);
await uploadFiles(bo, [fixture('clip.mp4')]);
const anon = await phonePage();

// ── Review: nobody but the uploader and the hosts sees anything until a host approves ──
const count = async (p) => { await p.goto(`${BASE}/album/${slug}`); await p.waitForLoadState('networkidle'); return tiles(p).count(); };
check((await count(ivy)) === 2, 'before approval an invitee sees only her own 2 uploads');
check((await count(bo)) === 1, '…a guest sees only their own');
check((await count(vic)) === 0, '…a view-only guest sees nothing yet');
check((await count(cara)) === 4, '…while the host sees all 4');
check(await bo.getByText('waiting for the hosts').isVisible(), 'guests are told their photos wait for the hosts');
await cara.goto(ev.manage);
check(await cara.getByText('4 new photos are waiting for your OK').isVisible(), 'the manage page says what’s waiting');
check(await cara.getByRole('navigation', { name: 'Manage' }).getByRole('link', { name: /Photos/ }).innerText().then((t) => t.includes('4')), '…and the Photos tab shows how many');
await cara.goto(`${ev.manage}/photos`);
check(await cara.locator('#review').getByText(/OK in \d+ min/).first().isVisible() && !(await cara.locator('#review').getByRole('button', { name: /^Approve (all|\d+)/ }).isVisible()),
  'fresh uploads can’t be approved until their upload links run out');
await approveAll(cara, ev);
check((await count(vic)) === 4 && (await count(ivy)) === 4, 'once approved, everyone who can see the album sees them');
const [{ n: waitingNow }] = await db`SELECT count(*)::int AS n FROM events.uploads WHERE event_id = ${ev.id} AND approved_at IS NULL`;
check(waitingNow === 0, '…and nothing is left waiting');

const [{ id: someUpload }] = await db`SELECT id FROM events.uploads WHERE event_id = ${ev.id} AND uploader_name LIKE 'Ivy%' LIMIT 1`;

// ── Probe ───────────────────────────────────────────────────────────────────
async function probe(p) {
  await p.goto(`${BASE}/album/${slug}`);
  await p.waitForLoadState('networkidle');
  const join = await p.locator('#code').isVisible().catch(() => false);
  const heading = (await p.getByRole('heading', { name: 'All photos', exact: true }).isVisible()) ? 'All photos'
    : (await p.getByRole('heading', { name: 'Your uploads', exact: true }).isVisible()) ? 'Your uploads' : null;
  return {
    join,
    upload: await p.getByText('Add photos & videos').isVisible(),
    heading,
    tiles: heading ? await tiles(p).count() : 0,
    chat: await p.getByRole('heading', { name: 'Group chat' }).isVisible(),
    manage: await p.getByRole('link', { name: 'Manage' }).isVisible(),
  };
}

const FULL = { join: false, upload: true, heading: 'All photos', tiles: 4, chat: true };
const VIEW = { join: false, upload: false, heading: 'All photos', tiles: 4, chat: false };
const JOIN = { join: true, upload: false, heading: null, tiles: 0, chat: false };
const expected = (state) => ({
  admin: { ...FULL, manage: true },
  owner: { ...FULL, manage: true },
  curator: { ...FULL, manage: true },
  invitee: { ...FULL, manage: false },
  family: state === 'family' || state === 'public' ? { ...VIEW, manage: false } : { ...JOIN, manage: false },
  // Upload-only guests see just their own uploads, unless the album is public.
  'guest upload-only': state === 'public'
    ? { ...VIEW, upload: true, manage: false }
    : { join: false, upload: true, heading: 'Your uploads', tiles: 1, chat: false, manage: false },
  'guest view-only': { ...VIEW, manage: false },
  'guest both': { ...VIEW, upload: true, manage: false },
  anonymous: state === 'public' ? { ...VIEW, manage: false } : { ...JOIN, manage: false },
});
const actors = { admin, owner: cara, curator: cody, invitee: ivy, family: fay, 'guest upload-only': uma, 'guest view-only': vic, 'guest both': bo, anonymous: anon };

for (const [state, status, audience] of [['draft', 'draft', 'invitees'], ['invitees', 'published', 'invitees'], ['family', 'published', 'family'], ['public', 'published', 'public']]) {
  await setAudience(cara, ev, status, audience);
  const exp = expected(state);
  for (const [who, p] of Object.entries(actors)) {
    const got = await probe(p);
    const want = exp[who];
    const diffs = Object.keys(want).filter((k) => got[k] !== want[k]).map((k) => `${k}: got ${got[k]}, want ${want[k]}`);
    check(!diffs.length, `[${state}] ${who}${diffs.length ? ` (${diffs.join('; ')})` : ''}`);
  }

  // APIs agree with the pages.
  const dl = (p) => p.request.post(`${BASE}/album/${slug}/api/download`, { form: { id: someUpload } }).then((r) => r.status());
  const up = (p) => p.request.post(`${BASE}/album/${slug}/api/uploads`, { data: { name: 'x.jpg', type: 'image/jpeg', size: 10 } }).then((r) => r.status());
  const comment = (p) => p.request.post(`${BASE}/album/${slug}/api/comments`, { data: { upload: someUpload, body: `hi from ${state}` } }).then((r) => r.status());
  const chat = (p) => p.request.get(`${BASE}/album/${slug}/api/messages`).then((r) => r.status());
  check((await dl(anon)) === (state === 'public' ? 200 : 404), `[${state}] anonymous zip download ${state === 'public' ? 'allowed' : 'refused'}`);
  check((await up(anon)) === 403, `[${state}] anonymous upload refused`);
  check((await up(fay)) === 403, `[${state}] family member not on the event can't upload`);
  check((await up(vic)) === 403, `[${state}] view-only guest can't upload`);
  check((await comment(anon)) === 403, `[${state}] anonymous can't comment`);
  check((await comment(fay)) === (state === 'family' || state === 'public' ? 200 : 403), `[${state}] family member comments only when the family can see it`);
  check((await comment(uma)) === (state === 'public' ? 200 : 403), `[${state}] upload-only guest comments only when the album is public`);
  check((await comment(vic)) === 200, `[${state}] view-only guest can comment`);
  check((await chat(ivy)) === 200 && (await chat(bo)) === 403 && (await chat(fay)) === 403, `[${state}] chat is for event members only`);
  await fay.goto(`${BASE}/`);
  const listed = await fay.locator('section', { has: fay.getByRole('heading', { name: 'Family albums' }) }).getByRole('link', { name: `Matrix ${RUN}` }).isVisible();
  check(listed === (state === 'family' || state === 'public'), `[${state}] family member ${listed ? 'finds' : 'doesn’t see'} the album on their home page`);
}

// ── Management rights ──────────────────────────────────────────────────────
await ivy.goto(ev.manage);
check(ivy.url().endsWith(`/album/${slug}`), 'invitee is sent from the manage page to the album');
await cody.goto(`${ev.manage}/photos`);
check(await cody.getByRole('heading', { name: 'Photos & videos' }).isVisible(), 'curator (editor) can open the manage page');
check(!(await cody.getByRole('navigation', { name: 'Manage' }).getByRole('link', { name: 'QR & posters' }).isVisible()), 'curator has no QR & posters tab');
await cody.goto(`${ev.manage}/qr`);
check(!(await cody.getByRole('heading', { name: /Guest codes/ }).isVisible()), 'curator does not see guest codes');
await cody.goto(`${ev.manage}/people`);
check(!(await cody.locator('#user_id').isVisible()) && !(await cody.getByLabel(/’s role$/).first().isVisible()), 'curator cannot add people or change roles');
await cody.goto(`${ev.manage}/info`);
check(!(await cody.getByRole('heading', { name: /Gifts/ }).isVisible()), 'curator does not manage gift links');
await cody.goto(`${ev.manage}/photos`);
await anon.goto(ev.manage);
check(anon.url().includes('/login'), 'anonymous is sent to sign-in from the manage page');

// Curator hides Uma's photo: viewers stop seeing it
await cody.getByRole('button', { name: 'Open photo from Uma Uploader' }).click();
await cody.getByRole('dialog').getByRole('button', { name: 'Hide', exact: true }).click();
await cody.waitForTimeout(700);
check((await probe(vic)).tiles === 3, 'curator hides a photo; viewers stop seeing it');

// ── Losing access ───────────────────────────────────────────────────────────
await setAudience(cara, ev, 'published', 'invitees');
check((await probe(dan)).upload, 'Dan (invitee) has access before deactivation');
await admin.goto(BASE + '/admin');
await admin.locator('li.card', { hasText: user('dan') }).getByRole('button', { name: 'Deactivate' }).click();
await admin.waitForTimeout(700);
check((await probe(dan)).join, 'deactivated account loses access immediately');

await cara.goto(`${ev.manage}/people`);
await cara.locator('section', { has: cara.getByRole('heading', { name: /^Guests/ }) }).locator('li', { hasText: 'Bo Both' }).getByRole('button', { name: 'Remove' }).click();
await cara.waitForTimeout(700);
check((await probe(bo)).join, 'removed guest loses access immediately');

await cara.goto(`${ev.manage}/qr`);
await cara.locator('li', { hasText: `VIEW${RUN}` }).getByRole('button', { name: 'Turn off typed code' }).click();
await cara.waitForTimeout(700);
check((await probe(vic)).join, 'turning off a code ends the sessions of guests who used it');
check(!(await probe(uma)).join, 'other codes keep working');

// A fresh visitor can't use the turned-off code
const late = await phonePage();
await late.goto(`${BASE}/album/${slug}`);
await late.fill('#name', 'Late');
await late.fill('#code', `VIEW${RUN}`);
await late.getByRole('button', { name: 'Continue' }).click();
await late.getByText('doesn’t match').waitFor();
check(true, 'a turned-off code no longer lets anyone in');

// Sign-in still works for everyone else; the family member who isn't on the event sees it in no list
await fay.goto(BASE + '/events');
check(!(await fay.getByText(`Matrix ${RUN}`).isVisible()), 'event is not listed for people not on it');
await login(await page(), user('ivy'), pw);
check(true, 'invitee signs in with username + password');

await finish();
