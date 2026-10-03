// Shared helpers for the end-to-end suites. Each suite drives a running
// server (BASE_URL) in a real browser and checks results in the database,
// using its own uniquely named events and people so suites are independent.
import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import postgres from 'postgres';

export const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? '/tmp/i2w2i-storage';
// The bootstrap admin: made from an email, so its username is the part before the @.
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'eric@example.com',
  username: process.env.E2E_ADMIN_USERNAME ?? 'eric',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'supersecret123',
};
export const RUN = randomBytes(3).toString('hex');

export const fixture = (name) => join(FIXTURES, name);

export const db = postgres(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

const sandboxChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const browser = await chromium.launch(
  process.env.CHROMIUM_PATH || existsSync(sandboxChromium) ? { executablePath: process.env.CHROMIUM_PATH || sandboxChromium } : {},
);

const iphone = { ...devices['iPhone 13'] };
delete iphone.defaultBrowserType;
const pixel = { ...devices['Pixel 7'] };
delete pixel.defaultBrowserType;
export const PHONES = { iphone, pixel };

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
  process.exit(failures ? 1 : 0);
}

export async function page(opts = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
  return ctx.newPage();
}

export async function phonePage(kind = 'iphone') {
  return page(PHONES[kind]);
}

/** Signs in with a username (or, for accounts made before usernames, an email). */
export async function login(p, username, password) {
  await p.goto(BASE + '/login');
  // The tab only shows when email sign-in links are configured.
  const tab = p.getByRole('button', { name: 'Password', exact: true });
  if (await tab.isVisible()) await tab.click();
  await p.fill('#username', username);
  await p.fill('#password', password);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function adminPage() {
  const p = await page();
  await login(p, ADMIN.email, ADMIN.password);
  return p;
}

/** Reads the username and password from a "pass these on" box inside `scope`. */
export async function readCredentials(scope) {
  const user = scope.getByLabel('Their username');
  await user.waitFor();
  return { username: await user.innerText(), password: await scope.getByLabel('Their password').innerText() };
}

/** Fills the new-person fields (name, username, starting password) inside `scope`. */
async function fillNewPerson(scope, name, username, password) {
  await scope.getByLabel('Name', { exact: true }).fill(name);
  await scope.getByLabel('Username', { exact: true }).fill(username);
  if (password) await scope.getByLabel('Starting password').fill(password);
}

/** Adds someone from the People page; returns the username and password to pass on. */
export async function invite(admin, name, username, role = 'member', password) {
  await admin.goto(BASE + '/admin');
  const form = admin.locator('form', { has: admin.getByRole('button', { name: 'Add person' }) });
  await fillNewPerson(form, name, username, password);
  if (role === 'creator') await form.locator('input[value=creator]').check();
  await form.getByRole('button', { name: 'Add person' }).click();
  return readCredentials(form);
}

/** A host adds a brand-new person to their event (on its Manage page); returns their credentials. */
export async function hostInvite(host, ev, name, username, role = 'invitee', password) {
  if (new URL(host.url()).pathname !== new URL(ev.manage).pathname) await host.goto(ev.manage);
  const form = eventInviteForm(host);
  await fillNewPerson(form, name, username, password);
  await form.getByLabel('Their role').selectOption(role);
  await form.getByRole('button', { name: 'Add to this event' }).click();
  return readCredentials(form);
}

export const eventInviteForm = (p) => p.locator('form', { has: p.getByText('Add someone new', { exact: true }) });

/** Signs in as a newly added person in a fresh browser. Returns the page. */
export async function acceptInvite(creds, opts = {}) {
  const p = await page(opts);
  await login(p, creds.username, creds.password);
  return p;
}

/** Creates an event as the signed-in creator; returns { id, slug, manage }. */
export async function createEvent(p, title, slug) {
  await p.goto(BASE + '/events/new');
  await p.fill('#title', title);
  await p.fill('#slug', slug);
  await p.getByRole('button', { name: 'Create event' }).click();
  await p.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const manage = p.url();
  return { id: manage.split('/').pop(), slug, manage };
}

export async function createCode(p, ev, code, { upload = true, view = true, label = '' } = {}) {
  await p.goto(ev.manage);
  await p.fill('#code', code);
  if (label) await p.fill('#label', label);
  if (!upload) await p.locator('input[name=can_upload]').uncheck();
  if (!view) await p.locator('input[name=can_view]').uncheck();
  await p.getByRole('button', { name: 'Create code + QR' }).click();
  await p.getByText('Code created.').waitFor();
}

export async function addToEvent(p, ev, label, role = 'invitee') {
  await p.goto(ev.manage);
  const form = p.locator('form', { has: p.locator('#user_id') });
  await form.locator('#user_id').selectOption({ label });
  await form.locator('select[name=role]').selectOption(role);
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await p.waitForLoadState('networkidle');
}

export async function setAudience(p, ev, status, audience) {
  await p.goto(ev.manage);
  await p.selectOption('#status', status);
  await p.selectOption('#audience', audience);
  await p.getByRole('button', { name: 'Save', exact: true }).first().click();
  await p.getByText(/^Saved/).waitFor();
}

/** Joins an album as a guest with a typed code. */
export async function joinWithCode(p, slug, name, code) {
  await p.goto(`${BASE}/album/${slug}`);
  await p.fill('#name', name);
  await p.fill('#code', code);
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.waitForURL(`${BASE}/album/${slug}`);
  await p.waitForLoadState('networkidle');
}

/** Picks files in the uploader and waits until they're all added. */
export async function uploadFiles(p, files, timeout = 60000) {
  const before = await p.locator('[aria-label="Uploads"] li', { hasText: 'Added ✓' }).count();
  await p.locator('input[type=file]').setInputFiles(files);
  await p.waitForFunction(
    (n) => document.querySelectorAll('[aria-label="Uploads"] li').length && [...document.querySelectorAll('[aria-label="Uploads"] li')].filter((l) => l.textContent.includes('Added ✓')).length >= n,
    before + files.length,
    { timeout },
  );
}

export const tiles = (p) => p.locator('main ul li button[aria-label^="Open"]');

export async function storedSha(filename, uploader) {
  const [u] = await db`SELECT original_key, status FROM events.uploads WHERE filename = ${filename} AND uploader_name = ${uploader} ORDER BY created_at DESC LIMIT 1`;
  if (!u || u.status !== 'ready') return null;
  return createHash('sha256').update(readFileSync(join(STORAGE_DIR, u.original_key))).digest('hex');
}

export const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * A host approves everything waiting, from the manage page. Uploads can only
 * be approved once their upload links have expired (10 minutes); tests
 * fast-forward that in the database rather than wait.
 */
export async function approveAll(host, ev) {
  await db`UPDATE events.uploads SET writable_until = now() - interval '1 second' WHERE event_id = ${ev.id} AND writable_until > now()`;
  await host.goto(ev.manage);
  const review = host.locator('#review');
  if (!(await review.count())) return;
  await review.getByRole('button', { name: /^Approve (all|\d+)/ }).click();
  await review.waitFor({ state: 'detached' });
}
