// Shared helpers for the S-O-M end-to-end suites. Each suite drives a running
// server (BASE_URL) on two phones and checks the database and the bucket.
// Suites make their own accounts (through the bootstrap admin), so they're
// independent of each other.
import { execSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import postgres from 'postgres';

export const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
export const STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? '/tmp/som-storage';
export const ADMIN = { username: process.env.E2E_ADMIN_USERNAME ?? 'admin', password: process.env.E2E_ADMIN_PASSWORD ?? 'admin-password-1' };
export const RUN = randomBytes(3).toString('hex');
export const db = postgres(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

const sandboxChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH || existsSync(sandboxChromium) ? { executablePath: process.env.CHROMIUM_PATH || sandboxChromium } : {}),
  // A pretend microphone and camera, for voice notes.
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

/** The phone to pretend to be (E2E_DEVICE, any Playwright device name; default iPhone 13). */
export function device(name = process.env.E2E_DEVICE ?? 'iPhone 13') {
  const d = { ...devices[name] };
  if (!d.viewport) throw new Error(`unknown device ${name}`);
  delete d.defaultBrowserType;
  return d;
}

let failures = 0;
let passes = 0;
export function check(cond, msg) {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${msg}`);
}

export async function finish() {
  console.log(`\n${passes} passed, ${failures} failed`);
  await browser.close();
  await db.end();
  sink?.close();
  process.exit(failures ? 1 : 0);
}

/** A phone. Confirm dialogs are accepted and remembered in `dialogs`. */
export async function phone(who, deviceName) {
  const ctx = await browser.newContext({ ...device(deviceName), acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write', 'microphone', 'camera'], { origin: BASE });
  const p = await ctx.newPage();
  p.dialogs = [];
  p.errors = [];
  p.on('dialog', (d) => { p.dialogs.push(d.message()); void d.accept(); });
  p.on('pageerror', (e) => p.errors.push(`${who}: ${e.message}`));
  return p;
}

export async function login(p, username, password) {
  await p.goto(`${BASE}/login`);
  await p.fill('#username', username);
  await p.fill('#password', password);
  await p.getByRole('button', { name: 'Sign in' }).click();
}

/** fetch() from inside a signed-in page: { status, body }. */
export async function call(p, path, method = 'GET', body) {
  return p.evaluate(async ([path, method, body]) => {
    const r = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [path, method, body]);
}

let adminPage = null;
/** A fresh account, made by the admin (as Eric would for a cousin). */
export async function account(name) {
  if (!adminPage) {
    adminPage = await phone('admin');
    await login(adminPage, ADMIN.username, ADMIN.password);
    await adminPage.waitForURL((u) => !u.pathname.startsWith('/login'));
  }
  const username = `${name.toLowerCase()}-${RUN}`;
  const password = `${name.toLowerCase()}-pass-${RUN}`;
  const r = await call(adminPage, '/api/admin/accounts', 'POST', { name, username, password });
  if (r.status !== 200) throw new Error(`admin couldn’t add ${name}: ${JSON.stringify(r.body)}`);
  return { name, username, password };
}

export const TITLES = { lead: 'Captain Kay', follow: 'Sunny' };

/**
 * A pod as it's really made: the follow signs in, sets it up with a vault
 * passphrase, adds the lead (username, password and key link), and the lead
 * opens the link on their phone and picks their own passphrase.
 */
export async function newPod(deviceName) {
  const follow = await account('Sunny');
  const b = await phone('sunny', deviceName);
  await login(b, follow.username, follow.password);
  await b.getByText('Set up your pod').waitFor();
  await b.fill('#t-lead', TITLES.lead);
  await b.fill('#t-follow', TITLES.follow);
  follow.vault = `sunny vault words ${RUN}`;
  await b.fill('#pass', follow.vault);
  await b.fill('#again', follow.vault);
  await b.getByRole('button', { name: 'Create our pod' }).click();
  await b.getByText(`Hello, ${TITLES.follow}`).waitFor({ timeout: 30000 });
  await b.getByText(`Add ${TITLES.lead}`).click();
  await b.waitForURL(/settings/);
  await b.getByLabel('Name', { exact: true }).fill('Kay');
  await b.getByLabel('Username', { exact: true }).fill(`kay-${RUN}`);
  await b.getByRole('button', { name: 'Add them' }).click();
  await b.getByLabel('Their key link').waitFor();
  const link = await b.getByLabel('Their key link').innerText();
  const lead = { name: 'Kay', username: await b.getByLabel('Their username').innerText(), password: await b.getByLabel('Their password').innerText(), link };
  const r = await phone('kay', deviceName);
  await r.goto(link);
  await r.fill('#username', lead.username);
  await r.fill('#password', lead.password);
  await r.getByRole('button', { name: 'Sign in' }).click();
  await r.getByText('Choose your vault passphrase').waitFor({ timeout: 15000 });
  lead.vault = `kay keeps the keys ${RUN}`;
  await r.fill('#join-pass', lead.vault);
  await r.fill('#join-again', lead.vault);
  await r.getByRole('button', { name: 'Unlock our scenes' }).click();
  await r.getByText(`Hello, ${TITLES.lead}`).waitFor({ timeout: 30000 });
  const [{ id: podId }] = await db`SELECT p.id FROM som.pods p JOIN som.members m ON m.pod_id = p.id JOIN som.accounts a ON a.id = m.account_id WHERE a.username = ${follow.username}`;
  return { b, r, follow, lead, podId };
}

/**
 * Picks something for one part of a block in the scene builder: block 1's
 * "Two chores", say, and a menu item matching `label`.
 */
export async function pick(p, block, part, label) {
  const group = p.getByRole('group', { name: new RegExp(`^Block ${block}: ${part}`) });
  await group.getByRole('button', { name: /^\+ / }).click();
  const sheet = p.locator('dialog[open]').last();
  await sheet.getByRole('button', { name: label instanceof RegExp ? label : new RegExp(label) }).first().click();
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
}

/** Sunny starts a scene from the menu (picks: [block, part, label]) and Kay starts it. Returns the scene id. */
export async function runningScene(b, r, { title = `Scene ${RUN}`, picks = [], checkin = '' } = {}) {
  await b.goto(`${BASE}/`);
  await b.getByRole('button', { name: 'New scene' }).click();
  await b.waitForURL(/\/scene\//);
  const id = b.url().split('/').pop();
  await b.fill('#plan-title', title);
  for (const [block, part, label] of picks) await pick(b, block, part, label);
  if (checkin) await b.selectOption('#plan-checkin', checkin);
  await b.getByText('Saved').waitFor({ timeout: 10000 });
  await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
  await b.getByText(`Sent to ${TITLES.lead}`).waitFor();
  await r.goto(`${BASE}/scene/${id}`);
  await r.getByRole('button', { name: 'Start now' }).click();
  await r.locator('dialog[open]').getByRole('button', { name: 'Start now' }).click();
  await r.getByText(`${TITLES.follow}’s tasks`).waitFor();
  return id;
}

// ── Small phones ────────────────────────────────────────────────────────────
/** The small phone the layout checks use (E2E_LAYOUT_DEVICE; default iPhone SE). */
export const SMALL = process.env.E2E_LAYOUT_DEVICE ?? 'iPhone SE';
const SHOTS = process.env.E2E_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let shot = 0;

/**
 * Checks the screen as it is: nothing wider than the screen, text boxes at
 * 16px or more (so iPhones don't zoom in on them), and buttons big enough
 * to tap. With E2E_SHOTS=<dir>, saves a screenshot there.
 */
export async function audit(p, name) {
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const shown = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.sr-only') && !el.closest('dialog:not([open])');
    };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const wide = [...document.querySelectorAll('body *')].filter(shown).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1);
    const smallText = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')]
      .filter(shown).filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);
    const smallTaps = [...document.querySelectorAll('.btn, .btn-follow, .btn-quiet, .btn-stop, .chip')]
      .filter(shown).filter((el) => el.getBoundingClientRect().height < 36);
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      wide: wide.slice(0, 4).map(label),
      smallText: smallText.map(label),
      smallTaps: smallTaps.map(label),
    };
  });
  check(r.overflow <= 0 && !r.wide.length, `${name}: nothing wider than the screen${r.wide.length ? ` (${r.wide.join(' | ')})` : ''}`);
  check(!r.smallText.length, `${name}: text boxes are 16px or more${r.smallText.length ? ` (${r.smallText.join(' | ')})` : ''}`);
  check(!r.smallTaps.length, `${name}: buttons are big enough to tap${r.smallTaps.length ? ` (${r.smallTaps.join(' | ')})` : ''}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, '0')}-${name.replace(/[^\w]+/g, '-')}.png`, fullPage: true });
}

// ── Made in the browser: photos and a short video ───────────────────────────
export async function png(p, label, color = '#37a') {
  return {
    name: `${label.toLowerCase()}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(await p.evaluate(([label, color]) => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 700;
      const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 900, 700);
      x.fillStyle = '#fff'; x.font = 'bold 90px sans-serif'; x.fillText(label, 60, 380);
      return c.toDataURL('image/png').split(',')[1];
    }, [label, color]), 'base64'),
  };
}

export async function webm(p) {
  return {
    name: 'clip.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const x = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      let i = 0;
      const t = setInterval(() => { x.fillStyle = `hsl(${(i += 12) % 360} 70% 50%)`; x.fillRect(0, 0, 320, 240); }, 66);
      rec.start(200);
      await new Promise((r) => setTimeout(r, 1500));
      rec.stop(); clearInterval(t);
      await new Promise((r) => (rec.onstop = r));
      const u = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let s = ''; for (let k = 0; k < u.length; k++) s += String.fromCharCode(u[k]);
      return btoa(s);
    }), 'base64'),
  };
}

// ── At rest ─────────────────────────────────────────────────────────────────
/** Every row of every S-O-M table as text, to search for anything readable. */
export async function databaseText() {
  const tables = await db`SELECT table_name FROM information_schema.tables WHERE table_schema = 'som' AND table_type = 'BASE TABLE'`;
  let all = '';
  for (const { table_name } of tables) {
    const rows = await db.unsafe(`SELECT row_to_json(t)::text AS j FROM som.${table_name} t`);
    all += rows.map((x) => x.j).join('\n');
  }
  return all;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}
/** Objects in the (local) bucket, without the local driver's .type notes. */
export function bucketObjects(prefix = '') {
  return walk(join(STORAGE_DIR, prefix)).filter((f) => !f.endsWith('.type'));
}
/** True when a file starts like a picture, a video or a sound file. */
export function looksReadable(file) {
  const h = readFileSync(file).subarray(0, 12);
  return h.subarray(0, 3).toString('hex') === 'ffd8ff' || h.subarray(1, 4).toString() === 'PNG' || h.subarray(0, 4).toString('hex') === '1a45dfa3'
    || h.subarray(4, 8).toString() === 'ftyp' || h.subarray(0, 4).toString() === 'OggS' || h.subarray(0, 4).toString() === 'RIFF';
}

// ── A stand-in push service ─────────────────────────────────────────────────
// Push services are HTTPS; a throwaway certificate (the server accepts it
// only with PUSH_ALLOW_ANY_ENDPOINT=1). Messages are decrypted like a phone would.
const ece = createRequire(import.meta.url)('http_ece');
let sink = null;
export const pushes = [];
export async function pushService(port = 4998) {
  const tls = mkdtempSync(join(tmpdir(), 'som-push-'));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${tls}/k.pem -out ${tls}/c.pem -days 1 -subj /CN=127.0.0.1 2>/dev/null`);
  const phones = new Map();
  sink = createServer({ key: readFileSync(`${tls}/k.pem`), cert: readFileSync(`${tls}/c.pem`) }, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const who = req.url.split('/').pop();
      const ph = phones.get(who);
      try {
        const msg = JSON.parse(ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: ph.ecdh, authSecret: ph.auth }).toString());
        pushes.push({ who, ...msg, at: Date.now() });
      } catch (err) {
        pushes.push({ who, error: String(err), at: Date.now() });
      }
      res.writeHead(201).end();
    });
  });
  await new Promise((r) => sink.listen(port, '127.0.0.1', r));
  /** Turns notifications on for this signed-in page, as `who`. */
  return async function subscribe(p, who) {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = randomBytes(16).toString('base64url');
    phones.set(who, { ecdh, auth });
    const r = await call(p, '/api/push', 'POST', { endpoint: `https://127.0.0.1:${port}/push/${who}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth } });
    if (r.status !== 200) throw new Error(`couldn’t subscribe ${who}: ${JSON.stringify(r.body)}`);
  };
}

/** Waits for a notification to `who` whose text matches. */
export async function pushTo(who, re, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = pushes.find((m) => m.who === who && re.test(`${m.title} ${m.body}`));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
