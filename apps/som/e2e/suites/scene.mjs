// A whole scene on two phones: Sunny drafts it from the menu, Kay starts
// it, proof goes back and forth (several photos, a list of notes, a voice
// note, a video), check-ins, pause, "on my way", inspection, aftercare and
// close. Notifications go to the right phone and say nothing about the
// scene; the database and the bucket hold nothing readable.
import { BASE, bucketObjects, check, databaseText, db, finish, looksReadable, newPod, pick, png, pushService, pushTo, pushes, TITLES, webm } from '../lib.mjs';

const subscribe = await pushService();
const { b, r } = await newPod();
await subscribe(b, 'sunny');
await subscribe(r, 'kay');
const TITLE = 'Friday night';
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = async (p) => { await sheet(p).getByRole('button', { name: 'Close' }).first().click(); };

// ── Sunny drafts ────────────────────────────────────────────────────────────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const id = b.url().split('/').pop();
await b.fill('#plan-title', TITLE);
// A long day's shape, partly filled: block 1 at home, and a dance in the free hour.
await b.getByRole('button', { name: '8 hours' }).click();
check((await b.getByRole('region', { name: /^Block \d/ }).allInnerTexts()).map((t) => t.split('\n')[0]).join(' · ') === '1. Home · 2. Out · 3. Free time · 4. Home · 5. Welcome home',
  '8 hours is home, out, a free hour, home again, and welcome home');
await pick(b, 1, 'Getting ready', 'Shower');
await pick(b, 1, 'Two chores', 'Deep-clean the');
await b.getByLabel('Deep-clean the ___: room').selectOption('Kitchen');
await pick(b, 1, 'Devotion', 'Daily affirmations');
// Something written for this scene alone, with its own proof.
await b.getByRole('group', { name: `Block 1: For ${TITLES.lead} (15 min)` }).getByRole('button', { name: /^\+ / }).click();
await sheet(b).getByRole('button', { name: '✍️ Write your own' }).click();
await sheet(b).getByLabel('Your own: what to do').fill('Outfit options');
await sheet(b).getByRole('button', { name: '+ 📷 Photos' }).click();
await sheet(b).getByLabel('How many').last().fill('3');
await sheet(b).getByRole('button', { name: 'Add it' }).click();
await sheet(b).getByRole('button', { name: 'Done', exact: true }).click();
await pick(b, 3, 'A play break', 'A dance, on video');
const chores = b.getByRole('group', { name: 'Block 1: Two chores' });
check((await chores.getByText('1/2').count()) === 1, 'a home block wants two chores (1/2 so far)');
await b.getByRole('group', { name: 'Block 4: Two chores' }).getByRole('button', { name: /^\+ / }).click();
check(await sheet(b).getByRole('button', { name: /Deep-clean the/ }).isDisabled() && (await sheet(b).getByText('In block 1').count()) === 1, 'nothing twice in a day: what block 1 has is greyed out in block 4');
await closeSheet(b);
const arrival = b.getByRole('button', { name: /Arrival routine/ }).first();
if ((await arrival.getAttribute('aria-expanded')) !== 'true') await arrival.click();
await b.getByRole('button', { name: /Meet at the door/ }).click();
await b.selectOption('#plan-checkin', '15');
await b.getByText('Saved').waitFor({ timeout: 10000 });
await b.waitForTimeout(4500); // a poll or two after saving
check(await b.inputValue('#plan-title') === TITLE && (await b.getByText('5 tasks').count()) === 1, 'the builder keeps what was picked across saves and polls (5 tasks)');
await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText(`Sent to ${TITLES.lead}`).waitFor();
check(!!await pushTo('kay', /sent you a scene/), 'Kay hears a scene is waiting for her');

// ── Kay starts it ─────────────────────────────────────────────────────────
await r.goto(`${BASE}/scene/${id}`);
await r.getByText('sent you this scene').waitFor();
check(await r.inputValue('#plan-title') === TITLE, 'Kay sees Sunny’s draft');
await r.getByRole('button', { name: 'Start now' }).click();
await sheet(r).getByText('gets these 5 tasks').waitFor();
check((await sheet(r).getByText(/^Not filled yet: 1\. Two chores/).count()) === 1, 'starting a day that isn’t full says what’s missing (but lets it start)');
await sheet(r).getByRole('button', { name: 'Start now' }).click();
await r.getByText(`${TITLES.follow}’s tasks`).waitFor();
check(!!await pushTo('sunny', /started the scene/), 'Sunny hears it has started');

// ── Sunny: several photos for one task ──────────────────────────────────────
await b.getByText('Your tasks').waitFor({ timeout: 10000 });
check((await b.getByRole('region', { name: /^Block 1\. Home/ }).getByRole('button').count()) === 4, 'Sunny’s tasks come block by block');
await b.getByRole('button', { name: /Deep-clean the Kitchen/ }).click();
await sheet(b).getByText('0/2 photos').waitFor();
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'BEFORE', '#7a3'), await png(b, 'AFTER', '#37a')]);
await sheet(b).getByText('2/2 photos').waitFor({ timeout: 30000 });
check(true, 'two photos for “before & after” count as 2 of 2');
await sheet(b).getByRole('button', { name: 'Send for review' }).click();
await sheet(b).getByText('For review').first().waitFor();
check(!b.dialogs.length, '…and with the proof complete, sending needs no “anyway?”');
check(!!await pushTo('kay', /sent something for review/), 'Kay hears something is waiting for review');
await closeSheet(b);

// ── A list of notes and a voice note ────────────────────────────────────────
await b.getByRole('button', { name: /Daily affirmations/ }).click();
await sheet(b).getByText('0/10 notes').waitFor();
await sheet(b).getByRole('textbox').fill(Array.from({ length: 6 }, (_, i) => `I am worthy of care, number ${i + 1}`).join('\n'));
await sheet(b).getByRole('button', { name: 'Send 6 notes' }).click();
await sheet(b).getByText('6/10 notes').waitFor();
check(true, 'six lines sent at once count as six of the ten affirmations');
await sheet(b).getByRole('button', { name: '🎙 Voice' }).click();
await b.waitForTimeout(2000);
await sheet(b).getByRole('button', { name: /Stop/ }).click();
await sheet(b).getByText('1/1 voice note').waitFor({ timeout: 30000 });
check(true, 'a voice note recorded in the app counts as the voice proof');
await sheet(b).getByRole('button', { name: 'Send for review' }).click();
await sheet(b).getByText('For review').first().waitFor();
check(b.dialogs.some((d) => d.includes('Still to send: 4 notes')), 'sending with notes missing asks first, saying what’s missing');
await closeSheet(b);

// ── A countdown and a video ─────────────────────────────────────────────────
await b.getByRole('button', { name: /A dance, on video/ }).click();
await sheet(b).getByRole('button', { name: 'Start the 2-minute timer' }).click();
await sheet(b).getByRole('timer').waitFor();
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await webm(b)]);
await sheet(b).getByText('1/1 video').waitFor({ timeout: 30000 });
check(true, 'a task with a countdown shows it; a video counts as the video proof');
check(!!await pushTo('sunny', /Time’s up on a task/, 15000), 'when the countdown runs out (2 test minutes) Sunny is told');
await closeSheet(b);

// ── Check-ins ───────────────────────────────────────────────────────────────
check(!!await pushTo('sunny', /Time to check in/, 20000), 'at the check-in time Sunny is asked to check in');
check(!!await pushTo('kay', /missed a check-in/, 20000), 'no check-in within the grace time: Kay is told');
await b.locator('#checkin').getByRole('button', { name: 'Check in' }).click();
await b.getByRole('button', { name: '😊 Great' }).click();
await b.getByLabel('Check-in note').fill('Kitchen done, starting on the outfits.');
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'HI', '#a37')]);
await sheet(b).getByText('1 attached').waitFor();
await b.getByRole('button', { name: 'Send check-in' }).click();
await b.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 30000 });
await b.locator('#notes').getByRole('button', { name: 'Open photo' }).waitFor({ timeout: 15000 });
check(true, 'a check-in with a mood, a note and a photo shows in the notes');
check(!!await pushTo('kay', /checked in/), 'Kay hears Sunny checked in');

// ── Kay reviews ───────────────────────────────────────────────────────────
await r.reload();
await r.getByText('checked in').waitFor();
await r.getByRole('region', { name: 'Waiting for review' }).getByRole('button', { name: /Deep-clean the Kitchen/ }).click();
await sheet(r).getByRole('button', { name: 'Open photo' }).first().click();
await sheet(r).locator('img').waitFor({ timeout: 15000 });
check((await sheet(r).getByText('Decrypted on this phone only').count()) === 1, 'Kay opens Sunny’s photo, decrypted on her phone');
const [download] = await Promise.all([r.waitForEvent('download'), sheet(r).getByRole('button', { name: 'Save to phone' }).click()]);
const saved = await download.path();
const head = (await import('node:fs')).readFileSync(saved).subarray(0, 3).toString('hex');
check(head === 'ffd8ff', '“Save to phone” saves the real photo (a JPEG), not the encrypted copy');
check((await sheet(r).getByRole('button', { name: 'Delete' }).count()) === 0, 'Kay can’t delete what Sunny sent');
await closeSheet(r);
await sheet(r).getByRole('button', { name: 'Approve ✓' }).click();
await sheet(r).getByText('Approved').first().waitFor();
check(!!await pushTo('sunny', /approved a task/), 'Sunny hears her task was approved');
await closeSheet(r);
await r.getByRole('button', { name: /Daily affirmations/ }).first().click();
await sheet(r).getByText('I am worthy of care, number 6').waitFor();
await sheet(r).getByRole('button', { name: 'Send back' }).click();
await sheet(r).getByLabel('What to fix (optional)').fill('Ten, please. Four more.');
await sheet(r).getByRole('button', { name: 'Send it back' }).click();
await sheet(r).getByText('Sent back').first().waitFor();
check(!!await pushTo('sunny', /sent a task back/), 'Sunny hears a task came back');
await closeSheet(r);

await b.reload();
await b.getByRole('button', { name: /Daily affirmations/ }).click();
await sheet(b).getByText('Ten, please. Four more.').waitFor();
await sheet(b).getByRole('textbox').fill('I am patient\nI am playful\nI am brave\nI am loved');
await sheet(b).getByRole('button', { name: 'Send 4 notes' }).click();
await sheet(b).getByText('10/10 notes').waitFor();
check(true, 'Sunny sees why it came back, adds four more, and the count reaches 10/10');
await closeSheet(b);

// ── Pause: the one who paused resumes ───────────────────────────────────────
await b.getByRole('button', { name: 'Pause' }).click();
await b.getByText('You paused the scene').waitFor();
check(!!await pushTo('kay', /paused the scene/), 'Kay hears the moment Sunny pauses');
await r.reload();
await r.getByText(`${TITLES.follow} paused the scene`).waitFor();
check((await r.getByRole('button', { name: 'Resume' }).count()) === 0, 'Kay can’t resume Sunny’s pause from the screen…');
const forced = await r.evaluate(async (id) => (await fetch(`/api/scenes/${id}/pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"paused":false}' })).status, id);
check(forced === 403, '…or around it');
const taskWhilePaused = await b.evaluate(async ([id, t]) => (await fetch(`/api/scenes/${id}/tasks/${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"start"}' })).status,
  [id, (await db`SELECT id FROM som.tasks WHERE scene_id = ${id} AND status = 'todo' LIMIT 1`)[0].id]);
check(taskWhilePaused === 409, 'nothing moves while paused');
await b.getByRole('button', { name: 'Resume' }).click();
await b.getByText('You paused the scene').waitFor({ state: 'detached' });
await b.getByText('Your tasks').waitFor();

// ── On my way ───────────────────────────────────────────────────────────────
await r.reload();
await r.getByRole('button', { name: /On my way/ }).click();
await sheet(r).getByRole('button', { name: '20 min' }).click();
check(!!await pushTo('sunny', /on the way: about 20 minutes/), 'Sunny hears Kay is on the way');
await b.reload();
await b.locator('#arrival').getByText('until arrival').waitFor();
check((await b.locator('#arrival').getByText('Meet at the door with a drink').count()) === 1, 'Sunny gets a countdown and the arrival routine');
check(!!await pushTo('sunny', /arrives in about 5 minutes/, 25000) && !!await pushTo('sunny', /arriving now/, 25000), '…and reminders at 5 minutes and on arrival');

// ── Inspection ──────────────────────────────────────────────────────────────
await r.getByRole('button', { name: 'Start the inspection' }).click();
await r.getByText('Scorecard').first().waitFor();
check(r.dialogs.some((d) => /tasks? aren’t finished/.test(d)), 'starting the inspection with tasks open asks first');
check(!!await pushTo('sunny', /Inspection time/), 'Sunny hears it’s inspection time');
for (const cat of ['Presentation', 'Task completion', 'Quality of work', 'Attitude']) {
  await r.getByRole('radiogroup', { name: cat, exact: true }).getByRole('radio', { name: cat === 'Attitude' ? '5' : '4' }).click();
}
await r.getByLabel('Inspection notes').fill('Lovely work on the kitchen.');
await r.getByRole('button', { name: /Massage/ }).click();
await r.getByLabel('Massage: mins').fill('20');
await r.getByRole('button', { name: /Cook dinner/ }).click();
await r.getByRole('button', { name: `Share with ${TITLES.follow}` }).click();
await r.getByRole('region', { name: 'Results' }).waitFor();
await b.reload();
const results = b.getByRole('region', { name: 'Results' });
await results.waitFor();
check((await results.innerText()).includes('17') && (await results.innerText()).includes('Massage (20 mins)') && (await results.innerText()).includes('Cook dinner'),
  'Sunny sees the scorecard (17/20), the reward and the service');
await r.getByRole('button', { name: 'Time for aftercare' }).click();

// ── Aftercare and close ─────────────────────────────────────────────────────
await r.getByText('Back to us').first().waitFor();
check(await r.evaluate(() => document.documentElement.dataset.mode) === 'us', 'aftercare switches to the calm “us” colours');
await b.reload();
await b.getByText('Cuddle on the couch').click();
check(await b.getByLabel('Cuddle on the couch').isChecked(), 'a tick in the aftercare list shows straight away');
await r.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent.includes('Cuddle on the couch') && l.querySelector('input')?.checked), null, { timeout: 10000 });
check(true, '…and on the other phone');
await b.getByLabel('How do you feel?').fill('Seen. Tired in a good way.');
await b.getByRole('button', { name: 'Yes', exact: true }).click();
await b.getByText('Keep this to myself').click();
await b.getByRole('button', { name: 'Save reflection' }).click();
await b.getByText('Only you').waitFor();
await r.getByLabel('How do you feel?').fill('Proud of her.');
await r.getByRole('button', { name: 'Save reflection' }).click();
check(!!await pushTo('sunny', /wrote a reflection/) && !pushes.some((m) => m.who === 'kay' && /wrote a reflection/.test(`${m.body}`)),
  'Sunny hears Kay wrote a reflection; Sunny’s private one tells nobody');
await b.getByRole('button', { name: 'I’m back to us' }).click();
await b.getByText('You’re back to us').waitFor();
const [{ status: still }] = await db`SELECT status FROM som.scenes WHERE id = ${id}`;
check(still === 'aftercare', 'the scene stays open until both are back to “us”');
await r.reload();
await r.getByRole('button', { name: 'I’m back to us' }).click();
await r.getByText('tasks approved').waitFor({ timeout: 10000 });
check(true, 'when both are back to “us” the scene closes into a record');
check((await r.getByText('Seen. Tired in a good way.').count()) === 0, 'a private reflection stays private');
check((await r.getByText('Proud of her.').count()) === 1, 'Kay’s own reflection shows in the record');

// ── What the server holds ───────────────────────────────────────────────────
check(pushes.every((m) => !m.error), 'every notification decrypts on the phone it was meant for');
const leaks = pushes.filter((m) => /Friday|Kitchen|affirm|worthy|dance|Massage|Outfit/i.test(`${m.title} ${m.body}`));
check(leaks.length === 0, `notifications never say what’s in the scene${leaks.length ? `: ${JSON.stringify(leaks)}` : ''}`);
const text = await databaseText();
const found = ['Friday night', 'Kitchen', 'worthy of care', 'Massage', 'Cuddle', 'Seen. Tired', 'Proud of her', 'Outfit options', 'Lovely work', TITLES.lead].filter((w) => text.includes(w));
check(found.length === 0, `nothing readable in the database${found.length ? `: ${found.join(', ')}` : ''}`);
const objects = bucketObjects(`s/${id}`);
check(objects.length >= 8 && objects.every((f) => !looksReadable(f)), `the bucket holds only ciphertext (${objects.length} objects)`);

const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
