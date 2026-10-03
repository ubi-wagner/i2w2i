// The installable web app and phone notifications for hosts. A local server
// stands in for the phone's push service: the test subscribes "phones",
// a guest uploads, and we decrypt what the server sends.
// Needs the server started with PUSH_ALLOW_ANY_ENDPOINT=1 and a short
// PUSH_REVIEW_DELAY_MS (see e2e/run.mjs / CI).
import { execSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BASE, PHONES, RUN, acceptInvite, adminPage, check, createCode, createEvent, db, finish, fixture, joinWithCode, page, uploadFiles,
} from '../lib.mjs';

const ece = createRequire(import.meta.url)('http_ece');

// ── Installable ─────────────────────────────────────────────────────────────
const anon = await page();
const manifest = await (await anon.request.get(`${BASE}/manifest.webmanifest`)).json();
check(manifest.name === 'i2w2i' && manifest.display === 'standalone' && manifest.start_url === '/', 'the app manifest loads signed out and opens full screen at home');
const iconsOk = await Promise.all(manifest.icons.map((i) => anon.request.get(BASE + i.src).then((r) => r.ok() && r.headers()['content-type'] === 'image/png')));
check(iconsOk.every(Boolean) && manifest.icons.some((i) => i.purpose === 'maskable'), '…with real icons, including the Android full-bleed one');
const sw = await anon.request.get(`${BASE}/sw.js`);
check(sw.ok() && (await sw.text()).includes("addEventListener('push'"), 'the service worker loads signed out');
await anon.goto(`${BASE}/login`);
check((await anon.locator('link[rel=manifest]').count()) === 1 && (await anon.locator('link[rel=apple-touch-icon]').getAttribute('href')) === '/icons/apple-touch-icon.png', 'pages link the manifest and the iPhone home-screen icon');

// ── A stand-in push service ─────────────────────────────────────────────────
// Push services are HTTPS; a throwaway certificate (the server trusts it only in test mode).
const tls = mkdtempSync(join(tmpdir(), 'push-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${tls}/k.pem -out ${tls}/c.pem -days 1 -subj /CN=127.0.0.1 2>/dev/null`);
const received = [];
const sink = createServer({ key: readFileSync(`${tls}/k.pem`), cert: readFileSync(`${tls}/c.pem`) }, (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(req.url.endsWith('/gone') ? 410 : 201).end();
  });
});
await new Promise((r) => sink.listen(4999, '127.0.0.1', r));
const SINK = 'https://127.0.0.1:4999/push';

function phone(path) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    sub: { endpoint: `${SINK}/${path}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: auth.toString('base64url') } },
    read: (msg) => JSON.parse(ece.decrypt(msg.body, { version: 'aes128gcm', privateKey: ecdh, authSecret: auth.toString('base64url') }).toString()),
  };
}
const waitFor = async (pred, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const hit = received.filter(pred); if (hit.length) return hit; await new Promise((r) => setTimeout(r, 200)); }
  return [];
};

// ── Hosts get one batched notification when guests' photos wait ────────────
const host = await adminPage();
const ev = await createEvent(host, `Notify ${RUN}`, `notify-${RUN}`);
await createCode(host, ev, `NTF${RUN}`.slice(0, 12).toUpperCase());
const hostPhone = phone(`host-${RUN}`);
const deadPhone = phone(`host-${RUN}/gone`);
const subscribe = (p, s) => p.request.post(`${BASE}/api/push`, { data: s.sub }).then((r) => r.status());
check((await subscribe(host, hostPhone)) === 200 && (await subscribe(host, deadPhone)) === 200, 'a host turns notifications on for two phones');
check((await anon.request.post(`${BASE}/api/push`, { data: hostPhone.sub, maxRedirects: 0 })).status() !== 200, 'signed-out visitors can’t subscribe');
const bad = await host.request.post(`${BASE}/api/push`, { data: { endpoint: `${SINK}/x`, keys: { p256dh: 'nope', auth: 'nope' } } });
check(bad.status() === 400, 'a malformed subscription is refused');

// An invitee on the event (not a host) also subscribes: they must get nothing.
const memberEmail = `nm-${RUN}@example.com`;
await host.goto(ev.manage);
const form = host.locator('form', { has: host.getByText('Invite someone by name and email', { exact: true }) });
await form.getByLabel('Name').fill(`Nora Member ${RUN}`);
await form.getByLabel('Email').fill(memberEmail);
await form.getByRole('button', { name: 'Invite' }).click();
await form.getByText(`Send Nora Member ${RUN} this link`).waitFor();
const nora = await acceptInvite(await form.getByLabel('One-time link').inputValue(), 'nora-password-1');
const noraPhone = phone(`nora-${RUN}`);
await subscribe(nora, noraPhone);

const guest = await page(PHONES.iphone);
await joinWithCode(guest, ev.slug, 'Gus Guest', `NTF${RUN}`.slice(0, 12));
await uploadFiles(guest, [fixture('portrait.jpg'), fixture('landscape-gps.jpg')]);
const hostMsgs = await waitFor((m) => m.path === `/push/host-${RUN}`);
check(hostMsgs.length === 1, 'two guest photos → one notification to the host (batched)');
const msg = hostMsgs[0] ? hostPhone.read(hostMsgs[0]) : {};
check(msg.title === `Notify ${RUN}` && msg.body === '2 new photos are waiting for your OK.', `it says how many are waiting (“${msg.body}”)`);
check(msg.url === `/events/${ev.id}#review` && msg.tag === `review-${ev.id}`, 'tapping it opens the review queue; later ones replace it');
check(/^vapid t=.+, k=.+/.test(hostMsgs[0]?.headers.authorization ?? '') && hostMsgs[0]?.headers['content-encoding'] === 'aes128gcm', 'it’s signed (VAPID) and encrypted end to end');
check(received.every((m) => !m.path.startsWith(`/push/nora-${RUN}`)), 'guests on the event (not hosts) get no review notifications');
const [{ n: deadLeft }] = await db`SELECT count(*)::int AS n FROM core.push_subscriptions WHERE endpoint = ${deadPhone.sub.endpoint}`;
check(deadLeft === 0, 'a phone that’s gone (410) is forgotten');

// Hosts' own uploads need no review, so no notification.
const before = received.length;
await host.goto(`${BASE}/album/${ev.slug}`);
await uploadFiles(host, [fixture('portrait.jpg')]);
await new Promise((r) => setTimeout(r, 4000));
check(received.length === before, 'a host’s own upload sends nothing');

// "Send a test"
const t = await host.request.post(`${BASE}/api/push/test`);
check(t.ok() && (await t.json()).sent === 1 && (await waitFor((m) => m.path === `/push/host-${RUN}` && hostPhone.read(m).tag === 'test')).length === 1, '“Send a test” reaches the phone');

// Turning off stops them.
await host.request.delete(`${BASE}/api/push`, { data: { endpoint: hostPhone.sub.endpoint } });
const afterOff = received.length;
await uploadFiles(guest, [fixture('portrait.jpg')]);
await new Promise((r) => setTimeout(r, 4000));
check(received.length === afterOff, 'after turning notifications off, nothing more arrives');

// ── Screens ─────────────────────────────────────────────────────────────────
await host.goto(ev.manage);
await host.getByRole('button', { name: 'Turn on notifications' }).waitFor({ timeout: 5000 }).catch(() => {});
check(await host.getByRole('button', { name: 'Turn on notifications' }).isVisible(), 'hosts see “Turn on notifications” on the manage page');
await host.goto(`${BASE}/account`);
check(await host.getByRole('heading', { name: 'Notifications' }).isVisible(), 'the account page has a Notifications section');

// iPhone Safari (no push until it's on the home screen): explain how, and offer the home-screen card.
const iphone = await page(PHONES.iphone);
await iphone.addInitScript(() => { delete window.PushManager; });
const momEmail = `mom-${RUN}@example.com`;
await host.goto(ev.manage);
await form.getByLabel('Name').fill(`Mom ${RUN}`);
await form.getByLabel('Email').fill(momEmail);
await form.getByRole('button', { name: 'Invite' }).click();
await form.getByText(`Send Mom ${RUN} this link`).waitFor();
const momLink = await form.getByLabel('One-time link').inputValue();
await iphone.goto(momLink);
await iphone.fill('#password', 'mom-password-1');
await iphone.fill('#confirm', 'mom-password-1');
await iphone.getByRole('button', { name: 'See the photos' }).click();
await iphone.waitForURL(`${BASE}/album/${ev.slug}`);
await iphone.getByText('Put i2w2i on your home screen').waitFor({ timeout: 5000 }).catch(() => {});
check(await iphone.getByText('Put i2w2i on your home screen').isVisible(), 'Mom is offered the home-screen icon right in the album');
await iphone.getByRole('button', { name: 'Show me how' }).click();
check(await iphone.getByText('Add to Home Screen', { exact: false }).first().isVisible(), '…with iPhone steps (Share → Add to Home Screen)');
await iphone.getByRole('button', { name: 'Not now' }).click();
await iphone.goto(`${BASE}/`);
check(!(await iphone.getByText('Put i2w2i on your home screen').isVisible()), '“Not now” is remembered');
await iphone.goto(`${BASE}/account`);
await iphone.getByText('notifications come through the home-screen app').waitFor({ timeout: 5000 }).catch(() => {});
check(await iphone.getByText('notifications come through the home-screen app').isVisible(), 'on iPhone Safari, the notifications section explains the home-screen step');

sink.close();
await finish();
