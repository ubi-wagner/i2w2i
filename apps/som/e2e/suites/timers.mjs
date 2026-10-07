// Every timer option, on two phones, with the stand-in push service. A
// four-hour scene: check-ins at the end of each block, every 15, 30, 45, 60,
// 90 and 120 minutes, and none; a missed one tells the lead and the
// reminders keep coming; checking in starts the clock again. Demands with
// each countdown (none, 5, 10, 15, 30, 60 minutes); time's up. Pause stops
// everything and resume moves the countdowns on. "On my way" with each
// choice, its 5-minute and arrival reminders, and a pause in between.
// Minutes are seconds here (SOM_MINUTE_MS=1000).
import { BASE, check, db, finish, newPod, pushService, pushes, TITLES } from '../lib.mjs';

const MIN = 1000;
// Only this suite's reminders: scenes earlier suites left running would ring
// the same stand-in phones (encrypted for other keys).
await db`UPDATE som.timers SET cancelled_at = now() WHERE fired_at IS NULL AND cancelled_at IS NULL`;
const subscribe = await pushService();
const { b, r } = await newPod();
await subscribe(b, 'sunny');
await subscribe(r, 'kay');
const sheet = (p) => p.locator('dialog[open]').last();
const near = (a, b, ms = 2500) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= ms;
const pending = async (id, kinds) => db`SELECT kind, task_id, fire_at FROM som.timers
  WHERE scene_id = ${id} AND fired_at IS NULL AND cancelled_at IS NULL AND kind = ANY(${kinds}) ORDER BY fire_at`;
const fireNow = (id, kind) => db`UPDATE som.timers SET fire_at = now() WHERE scene_id = ${id} AND kind = ${kind} AND fired_at IS NULL AND cancelled_at IS NULL`;
const sceneRow = async (id) => (await db`SELECT * FROM som.scenes WHERE id = ${id}`)[0];
/** The next notification to `who` matching `re`, after `since`. */
async function pushAfter(who, re, since, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = pushes.find((m) => m.who === who && m.at >= since && re.test(`${m.title} ${m.body}`));
    if (hit) return hit;
    await new Promise((res) => setTimeout(res, 200));
  }
  return null;
}
const checkinText = async (p) => (await p.locator('#checkin').innerText()).replace(/\s+/g, ' ');
async function checkIn(note) {
  await b.reload();
  await b.locator('#checkin').getByRole('button', { name: 'Check in' }).click();
  await b.getByRole('button', { name: '😊 Great' }).click();
  await b.getByLabel('Check-in note').fill(note);
  await b.getByRole('button', { name: 'Send check-in' }).click();
  await b.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 15000 });
}

// ── A four-hour scene, check-ins at the end of each block ───────────────────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const id = b.url().split('/').pop();
await b.getByRole('button', { name: '4 hours' }).click();
await b.getByRole('button', { name: /Fill it for me/ }).click();
await b.getByText('Saved').waitFor({ timeout: 10000 });
await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText(`Sent to ${TITLES.lead}`).waitFor();
await r.goto(`${BASE}/scene/${id}`);
await r.getByRole('button', { name: 'Start now' }).click();
await r.locator('dialog[open]').getByRole('button', { name: 'Start now' }).click();
await r.getByText(`${TITLES.follow}’s tasks`).waitFor();

let s = await sceneRow(id);
check(s.checkin_blocks && s.checkin_at.join() === '120,240' && near(s.next_checkin_at, s.checkin_base.getTime() + 120 * MIN, 50),
  'a four-hour scene checks in at the end of each block (after 2 and 4 hours)');
let due = await pending(id, ['checkin_due']);
check(due.length === 1 && near(due[0].fire_at, s.next_checkin_at, 50), '…with one reminder waiting, for the end of the first block');
await b.reload();
check((await checkinText(b)).includes('End of this block'), 'Sunny’s screen says her check-in is at the end of this block');

// Two hours on: the first block ends now.
let since = Date.now();
await db`UPDATE som.scenes SET checkin_base = now() - interval '120 seconds', next_checkin_at = now() WHERE id = ${id}`;
await fireNow(id, 'checkin_due');
s = await sceneRow(id);
check(!!await pushAfter('sunny', /Time to check in/, since), 'at the end of the block Sunny is asked to check in');
const after = await pending(id, ['checkin_due', 'checkin_overdue']);
const overdue = after.find((t) => t.kind === 'checkin_overdue');
const nextBlock = after.find((t) => t.kind === 'checkin_due');
check(overdue && near(overdue.fire_at, Date.now() + 10 * MIN, 3000), '…the lead is told if it’s missed, 10 minutes later');
check(nextBlock && near(nextBlock.fire_at, s.checkin_base.getTime() + 240 * MIN, 50), '…and the next block’s end is already set, answered or not');
await b.reload();
check((await checkinText(b)).includes('Due now'), 'her screen says it’s due now');
check(!!await pushAfter('kay', /missed a check-in/, since), 'not checked in within 10 minutes: Kay hears it was missed');

since = Date.now();
await checkIn('All good.');
check(!!await pushAfter('kay', /checked in/, since), 'Sunny checks in and Kay hears');
check(!(await pending(id, ['checkin_overdue'])).length, '…and the missed-check-in alarm is off');

// ── Every so many minutes, each choice ──────────────────────────────────────
await r.reload();
for (const n of [120, 90, 60, 45, 30, 15]) {
  const t0 = Date.now();
  await r.getByLabel('How often').selectOption(String(n));
  await r.waitForFunction((n) => document.querySelector('select[aria-label="How often"]')?.value === String(n), n);
  await r.waitForTimeout(300);
  s = await sceneRow(id);
  due = await pending(id, ['checkin_due']);
  check(s.checkin_minutes === n && !s.checkin_blocks && near(s.next_checkin_at, t0 + n * MIN) && due.length === 1 && near(due[0].fire_at, s.next_checkin_at, 50),
    `“Every ${n} minutes”: the next check-in is ${n} minutes away, one reminder set`);
}
await b.reload();
check(/Next in \d+:\d\d/.test(await checkinText(b)), 'Sunny’s screen counts down to her next check-in');
since = Date.now();
const first = await pushAfter('sunny', /Time to check in/, since, 25000);
check(!!first, 'after 15 minutes Sunny is asked to check in');
check(!!await pushAfter('kay', /missed a check-in/, since, 20000), 'she doesn’t: Kay hears it was missed');
const again = await pushAfter('sunny', /Time to check in/, first.at + 1, 20000);
check(!!again, '…and Sunny is asked again 15 minutes after the last one: the reminders keep coming');
since = Date.now();
await checkIn('Sorry, hands full.');
s = await sceneRow(id);
check(near(s.next_checkin_at, since + 15 * MIN, 4000) && !(await pending(id, ['checkin_overdue'])).length, 'checking in starts the 15 minutes again');

// ── None, then back to the block ends ───────────────────────────────────────
await r.reload();
await r.getByLabel('How often').selectOption('');
await r.waitForFunction(() => document.querySelector('select[aria-label="How often"]')?.value === '');
await r.waitForTimeout(300);
s = await sceneRow(id);
check(s.checkin_minutes === null && !s.checkin_blocks && s.next_checkin_at === null && !(await pending(id, ['checkin_due', 'checkin_overdue'])).length,
  '“No check-ins”: nothing is set and nobody is reminded');
await b.reload();
await b.getByRole('heading', { name: 'Your tasks' }).waitFor();
check(!(await b.locator('#checkin').count()), 'Sunny’s screen has no check-in to do');
await r.getByLabel('How often').selectOption('blocks');
await r.waitForFunction(() => document.querySelector('select[aria-label="How often"]')?.value === 'blocks');
await r.waitForTimeout(300);
s = await sceneRow(id);
due = await pending(id, ['checkin_due']);
check(s.checkin_blocks && due.length === 1 && near(due[0].fire_at, s.next_checkin_at, 50) && s.next_checkin_at > new Date(), '“At the end of each block” again: the next block end is set');

// ── Demands, with each countdown ────────────────────────────────────────────
const demandIds = {};
for (const n of [0, 5, 10, 15, 30, 60]) {
  await r.getByRole('button', { name: 'Demand' }).click();
  await sheet(r).getByRole('button', { name: '✍️ Write your own' }).click();
  await r.locator('#demand-what').fill(`Countdown ${n || 'none'}`);
  await sheet(r).getByRole('button', { name: n ? `${n} min` : 'None', exact: true }).click();
  const t0 = Date.now();
  await sheet(r).getByRole('button', { name: 'Send the demand' }).click();
  await r.waitForFunction(() => !document.querySelector('dialog[open]'));
  const [task] = await db`SELECT id, status, minutes, due_at, started_at FROM som.tasks WHERE scene_id = ${id} ORDER BY ord DESC LIMIT 1`;
  demandIds[n] = task.id;
  const timer = (await pending(id, ['task_due'])).find((t) => t.task_id === task.id);
  check(n ? task.status === 'started' && task.minutes === n && near(task.due_at, t0 + n * MIN) && timer && near(timer.fire_at, task.due_at, 50)
    : task.status === 'todo' && task.due_at === null && !timer,
  n ? `a demand with a ${n}-minute countdown starts it at once` : 'a demand with no countdown has none');
}
since = Date.now();
check(pushes.filter((m) => m.who === 'sunny' && /sent you a demand/.test(m.body)).length >= 6, 'Sunny hears about each demand');
await b.reload();
const fiveMin = b.getByRole('region', { name: 'Demands' }).getByRole('button', { name: /Countdown 5/ });
check(/\d+:\d\d left/.test(await fiveMin.innerText()), 'Sunny sees each countdown ticking');
check(!!await pushAfter('sunny', /Time’s up on a task/, since - 6000, 15000), 'when 5 minutes are up, Sunny is told');
await b.waitForFunction(() => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Countdown 5') && x.textContent.includes('Time’s up')), null, { timeout: 10000 });
check(true, '…and the task says time’s up');

// ── Pause and resume ────────────────────────────────────────────────────────
const [{ due_at: before }] = await db`SELECT due_at FROM som.tasks WHERE id = ${demandIds[60]}`;
since = Date.now();
await b.getByRole('button', { name: 'Pause' }).click();
await b.getByText('You paused the scene').waitFor();
const pausedAt = (await sceneRow(id)).paused_at;
check(!!await pushAfter('kay', /paused the scene/, since), 'Sunny pauses: Kay hears at once');
check(!(await pending(id, ['checkin_due', 'checkin_overdue', 'task_due', 'arrival', 'arrival_soon'])).length, 'every reminder stops');
check((await checkinText(b)).includes('Paused') && !/\d+:\d\d left/.test(await b.getByRole('region', { name: 'Demands' }).getByRole('button', { name: /Countdown 60/ }).innerText()), 'her screen shows the check-in and the countdowns paused');
await b.waitForTimeout(3000);
since = Date.now();
await b.getByRole('button', { name: 'Resume' }).click();
await b.getByText('You paused the scene').waitFor({ state: 'detached' });
check(!!await pushAfter('kay', /resumed the scene/, since), 'she resumes: Kay hears');
const [{ due_at: moved }] = await db`SELECT due_at FROM som.tasks WHERE id = ${demandIds[60]}`;
const shift = moved - before;
const shouldBe = Date.now() - pausedAt.getTime();
check(Math.abs(shift - shouldBe) < 1500, `the countdowns move on by the time paused (${Math.round(shift / 1000)} s)`);
const resumed = await pending(id, ['task_due', 'checkin_due']);
const ticking = await db`SELECT id, due_at FROM som.tasks WHERE scene_id = ${id} AND status = 'started' AND due_at > now()`;
check(ticking.length >= 2 && ticking.every((t) => resumed.some((x) => x.kind === 'task_due' && x.task_id === t.id && near(x.fire_at, t.due_at, 50))) && resumed.some((t) => t.kind === 'checkin_due'),
  `…every countdown still running has its reminder back (${ticking.length}), and so does the check-in`);

// ── On my way, each choice ──────────────────────────────────────────────────
await r.reload();
for (const n of [90, 60, 45, 30, 20, 15, 10]) {
  await r.getByRole('button', { name: /On my way|^\d/ }).first().click();
  const t0 = Date.now();
  since = t0;
  await sheet(r).getByRole('button', { name: n < 60 ? `${n} min` : n === 90 ? '1½ h' : '1 h', exact: true }).click();
  await r.waitForFunction(() => !document.querySelector('dialog[open]'));
  s = await sceneRow(id);
  const a = await pending(id, ['arrival', 'arrival_soon']);
  check(near(s.arrival_at, t0 + n * MIN) && a.length === 2 && near(a[0].fire_at, s.arrival_at.getTime() - 5 * MIN, 50) && near(a[1].fire_at, s.arrival_at, 50),
    `on my way in ${n < 60 ? `${n} min` : `${n / 60} h`}: arriving then, with a reminder 5 minutes before`);
  check(!!await pushAfter('sunny', new RegExp(`on the way: about ${n} minutes`), since), `…and Sunny hears “about ${n} minutes”`);
}
// A pause on the way: travel doesn't stop, and its reminders come back.
since = Date.now();
await r.getByRole('button', { name: 'Pause' }).click();
await r.getByText('You paused the scene').waitFor();
await r.waitForTimeout(1000);
await r.getByRole('button', { name: 'Resume' }).click();
await r.getByText('You paused the scene').waitFor({ state: 'detached' });
const back = await pending(id, ['arrival', 'arrival_soon']);
check(back.map((t) => t.kind).join() === 'arrival_soon,arrival', 'after a pause on the way, both arrival reminders are back');
await b.reload();
check(/\d+:\d\d/.test(await b.locator('#arrival').getByRole('timer').innerText()), 'Sunny sees the countdown to arrival');
check(!!await pushAfter('sunny', /arrives in about 5 minutes/, since, 15000), '5 minutes out, Sunny is told');
check(!!await pushAfter('sunny', /is arriving now/, since, 15000), '…and again on arrival');
await b.locator('#arrival').getByText('Arriving now').waitFor({ timeout: 10000 });
check(true, 'her screen says Arriving now');

check(pushes.every((m) => !m.error), 'every notification decrypts on the phone it was meant for');
// Leave nothing ringing for the next suite.
await r.getByRole('button', { name: 'Pause' }).click();
await r.getByText('You paused the scene').waitFor();
const leaks = pushes.filter((m) => /Countdown|All good|hands full/.test(`${m.title} ${m.body}`));
check(!leaks.length, 'notifications never say what’s in the scene');
const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
