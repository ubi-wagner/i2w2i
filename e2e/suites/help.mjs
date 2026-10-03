// Help pages: open to everyone (the people who need them most can't sign in
// yet), every picture loads, they fit a phone, printing shows every answer,
// and the places people get stuck link to them.
import { ADMIN, BASE, RUN, adminPage, check, createEvent, finish, login, page, phonePage } from '../lib.mjs';

const PAGES = [
  ['/help', 'How can we help?'],
  ['/help/start', 'You got a link. Here’s all there is to it.'],
  ['/help/hosting', 'Running an event album'],
  ['/help/faq', 'Quick answers'],
];

const stranger = await phonePage();
for (const [path, heading] of PAGES) {
  const res = await stranger.goto(BASE + path);
  check(res.status() === 200 && stranger.url() === BASE + path, `${path} opens without signing in`);
  check(await stranger.getByRole('heading', { level: 1, name: heading }).isVisible(), `${path} shows its heading`);
  const images = await stranger.evaluate(async () => {
    const imgs = [...document.querySelectorAll('main img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    return { total: imgs.length, broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.src) };
  });
  check(images.broken.length === 0, `${path}: every picture loads (${images.total})${images.broken.length ? ` (broken: ${images.broken.join(', ')})` : ''}`);
  const overflow = await stranger.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${path} fits a phone screen`);
}
check(await stranger.getByRole('link', { name: 'Sign in' }).isVisible(), 'signed out, help offers Sign in instead of the account menu');
check(await stranger.getByRole('link', { name: 'Running an event', exact: true }).getAttribute('aria-current') === null, 'tabs mark only the page you’re on');
check(await stranger.getByRole('link', { name: 'Questions', exact: true }).getAttribute('aria-current') === 'page', 'the Questions tab is marked as current');

// Printing: the button prints, and every folded answer opens for the printout.
await stranger.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await stranger.getByRole('button', { name: 'Print or save as PDF' }).click();
check((await stranger.evaluate(() => window.__printed)) === 1, 'Print or save as PDF opens the print dialog');
const closed = () => stranger.evaluate(() => document.querySelectorAll('main details:not([open])').length);
const before = await closed();
await stranger.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
const during = await closed();
await stranger.evaluate(() => window.dispatchEvent(new Event('afterprint')));
check(before > 0 && during === 0 && (await closed()) === before, 'printing shows every answer, then folds them back');

// The pictures are public too.
const img = await stranger.request.get(BASE + '/help-img/host-card.webp');
check(img.ok() && img.headers()['content-type'] === 'image/webp', 'help pictures load signed out');

// Where people get stuck, help is a tap away.
await stranger.goto(BASE + '/login');
await stranger.getByRole('link', { name: 'How i2w2i works' }).click();
await stranger.waitForURL(BASE + '/help');
check(true, 'the sign-in page links to help');

const host = await adminPage();
const ev = await createEvent(host, `Help ${RUN}`, `help-${RUN}`);
await host.goto(ev.manage);
check(await host.getByRole('link', { name: 'step-by-step guide' }).getAttribute('href') === '/help/hosting', 'the Manage checklist links to the host guide');
await host.getByRole('banner').getByRole('link', { name: 'Help' }).click();
await host.waitForURL(BASE + '/help');
check(await host.getByRole('button', { name: 'Sign out' }).isVisible(), 'signed in, help keeps the normal header');

// The admin's header is the fullest one; it still fits a small phone.
const small = await page({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
await login(small, ADMIN.email, ADMIN.password);
check(await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'the header, Help included, fits a small phone');

const guest = await page();
await guest.goto(`${BASE}/album/${ev.slug}`);
check(await guest.getByRole('link', { name: 'How this works' }).getAttribute('href') === '/help/start#table', 'the album’s join page links to the guest instructions');

await finish();
