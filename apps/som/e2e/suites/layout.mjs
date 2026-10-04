// Every screen on a small phone (iPhone SE by default; E2E_LAYOUT_DEVICE to
// change it): nothing wider than the screen, text boxes at 16px or more (so
// iPhones don't zoom in on them), and buttons big enough to tap. With
// E2E_SHOTS=<dir>, saves a screenshot of each screen there.
import { audit, BASE, check, finish, newPod, phone, SMALL as DEVICE, TITLES } from '../lib.mjs';

const sheet = (p) => p.locator('dialog[open]').last();
const close = (p) => sheet(p).getByRole('button', { name: 'Close' }).first().click();

console.log(`on ${DEVICE}`);
const anon = await phone('anon', DEVICE);
await anon.goto(`${BASE}/login`);
await audit(anon, 'sign in');

const { b, r } = await newPod(DEVICE);
await audit(b, 'settings with the partner’s sign-in to pass on');
await b.goto(`${BASE}/`);
await b.getByText(`Hello, ${TITLES.follow}`).waitFor();
await audit(b, 'home');

// The menu, its ideas, text editing and one item.
await b.goto(`${BASE}/menu`);
await audit(b, 'menu');
await b.getByRole('button', { name: /^5\. Play break/ }).click();
await audit(b, 'menu section');
await b.getByRole('button', { name: 'Ideas for Play break' }).click();
await sheet(b).getByLabel('Search ideas').waitFor();
await audit(b, 'ideas');
await close(b);
await b.getByRole('button', { name: 'Edit as text' }).click();
await audit(b, 'section as text');
await sheet(b).getByRole('button', { name: 'Cancel' }).click();
await b.getByRole('button', { name: /A dance, on video/ }).first().click();
await audit(b, 'menu item');
await close(b);

// Drafting.
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const id = b.url().split('/').pop();
await b.fill('#plan-title', 'Layout check');
const open = async (title) => {
  const h = b.getByRole('button', { name: new RegExp(`^${title}`) }).first();
  if ((await h.getAttribute('aria-expanded')) !== 'true') await h.click();
};
await open('Presentation'); await b.getByRole('button', { name: /Shower/ }).first().click();
await open('Domain maintenance'); await b.getByLabel('Room 1', { exact: true }).selectOption('Kitchen'); await b.getByRole('button', { name: /Before & after photos/ }).first().click();
await open('Praise & task bank'); await b.getByRole('button', { name: /Daily affirmations/ }).first().click();
await b.getByLabel('Custom task', { exact: true }).fill('Outfit options');
await b.getByRole('button', { name: '+ 📷 Photos' }).last().click();
await open('Play break'); await b.getByRole('button', { name: /A dance, on video/ }).first().click();
await open('Consequences|Arrival routine');
await b.selectOption('#plan-checkin', '30');
await b.getByText('Saved').waitFor({ timeout: 10000 });
await audit(b, 'scene builder');
await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText(`Sent to ${TITLES.lead}`).waitFor();

// Starting it.
await r.goto(`${BASE}/`);
await r.getByText('Waiting for you').waitFor();
await audit(r, 'home with a scene waiting');
await r.goto(`${BASE}/scene/${id}`);
await r.getByText('sent you this scene').waitFor();
await audit(r, 'proposed scene');
await r.getByRole('button', { name: 'Start now' }).click();
await audit(r, 'start the scene?');
await sheet(r).getByRole('button', { name: 'Start now' }).click();
await r.getByText(`${TITLES.follow}’s tasks`).waitFor();

// Running.
await b.reload();
await b.getByText('Your tasks').waitFor();
await audit(b, 'running (follow)');
await b.getByRole('button', { name: /Daily affirmations/ }).click();
await sheet(b).getByText('0/10 notes').waitFor();
await audit(b, 'a task');
await close(b);
await b.locator('#checkin').getByRole('button', { name: 'Check in' }).click();
await audit(b, 'check in');
await close(b);
await r.reload();
await audit(r, 'running (lead)');
await r.getByRole('button', { name: /On my way/ }).click();
await audit(r, 'on my way?');
await sheet(r).getByRole('button', { name: '20 min' }).click();
await b.reload();
await b.locator('#arrival').getByText('until arrival').waitFor();
await audit(b, 'on the way');
await b.getByRole('button', { name: 'Pause' }).click();
await b.getByText('You paused the scene').waitFor();
await audit(b, 'paused');
await b.getByRole('button', { name: 'Resume' }).click();

// Inspection, aftercare, record.
await r.getByRole('button', { name: 'Start the inspection' }).click();
await r.getByText('Scorecard').first().waitFor();
await audit(r, 'scorecard');
for (const cat of ['Presentation', 'Task completion', 'Quality of work', 'Attitude']) await r.getByRole('radiogroup', { name: cat, exact: true }).getByRole('radio', { name: '4' }).click();
await r.getByRole('button', { name: /Massage/ }).click();
await r.getByRole('button', { name: `Share with ${TITLES.follow}` }).click();
await r.getByRole('region', { name: 'Results' }).waitFor();
await b.reload();
await b.getByRole('region', { name: 'Results' }).waitFor();
await audit(b, 'results');
await r.getByRole('button', { name: 'Time for aftercare' }).click();
await r.getByText('Back to us').first().waitFor();
await audit(r, 'aftercare');
await r.getByRole('button', { name: 'I’m back to us' }).click();
await b.reload();
await b.getByRole('button', { name: 'I’m back to us' }).click();
await b.getByText('tasks approved').waitFor({ timeout: 10000 });
await audit(b, 'record');

const errors = [...b.errors, ...r.errors, ...anon.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
