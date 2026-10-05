// A workday on two small phones. Kay offers Sunny a window of her time
// while she's at work; Sunny asks for a shorter window and a light load, and
// Kay agrees. Offers can't overlap, and one whose time has passed can't be
// accepted. Kay fills it in to fit with one tap and sends it (takes it back
// once, sends it again); Sunny can start it from half an hour before. While
// it runs Kay approves with praise, sends demands (a self-spank, a photo
// right now, "ask for more" about a task), sends a photo back to redo,
// praises, and says she's on her way. Then she scores every task she set,
// and Sunny sees the results. Every new screen is checked on the small
// phone; notifications say who, never what; the database holds nothing
// readable.
import { audit, BASE, call, check, databaseText, db, finish, newPod, pick, png, pushService, pushTo, pushes, SMALL, TITLES } from '../lib.mjs';

console.log(`on ${SMALL}`);
const subscribe = await pushService();
const { b, r, podId } = await newPod(SMALL);
await subscribe(b, 'sunny');
await subscribe(r, 'kay');
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = async (p) => { await sheet(p).getByRole('button', { name: 'Close' }).first().click(); };
const pressed = async (l) => (await l.getAttribute('aria-pressed')) === 'true';
const hours = (s) => (s.ends_at - s.starts_at) / 3_600_000;
const LAUNDRY = 'Laundry: wash, dry, fold and put away';

// ── Kay offers her day ──────────────────────────────────────────────────────
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: `Offer ${TITLES.follow} a scene` }).click();
await sheet(r).getByRole('button', { name: 'Tomorrow' }).waitFor();
check(await pressed(sheet(r).getByRole('button', { name: 'Tomorrow' })) && await r.inputValue('#window-from') === '08:30' && await r.inputValue('#window-until') === '16:30'
  && await pressed(sheet(r).getByRole('button', { name: '8 hours' })), 'an offer starts as tomorrow, 8:30 to 4:30 (8 hours)');
await sheet(r).getByLabel(`A note for ${TITLES.follow} (optional)`).fill('Big day at work. Make me proud.');
await audit(r, 'offer a scene');
await sheet(r).getByRole('button', { name: 'Send the offer' }).click();
await r.waitForURL(/\/scene\//);
const id = r.url().split('/').pop();
await r.getByText('Your offer').waitFor();
await r.getByText(`Waiting for ${TITLES.follow} to answer.`).waitFor();
// Every screen says whose turn it is, what's needed now and what comes next.
const whatNow = async (p) => (await p.getByRole('region', { name: 'What now' }).innerText()).toLowerCase();
const step = async (p) => (await p.getByRole('region', { name: 'What now' }).locator('[aria-current=step]').innerText()).trim();
check((await whatNow(r)).includes(`waiting for ${TITLES.follow.toLowerCase()}`) && (await whatNow(r)).includes('next:') && await step(r) === 'Plan & agree',
  'Kay’s offer says, at the top, that it’s waiting for Sunny, what happens next, and which step it’s on');
check(!!await pushTo('sunny', /offered you a scene/), 'Sunny hears she’s been offered a scene');
let [scene] = await db`SELECT status, starts_at, ends_at FROM som.scenes WHERE id = ${id}`;
check(scene.status === 'offered' && hours(scene) === 8 && scene.starts_at > new Date(), 'the offer is a window of 8 hours, in the future');
check((await call(r, `/api/scenes/${id}/action`, 'POST', { action: 'accept' })).status === 409, 'Kay can’t accept her own offer');

// ── Sunny asks for a shorter window and a light load ────────────────────────
await b.goto(`${BASE}/`);
const offerCard = b.getByRole('link', { name: new RegExp(`A scene from ${TITLES.lead}`) });
await offerCard.waitFor();
check((await offerCard.innerText()).includes('8 hours'), 'Sunny’s home shows the offer with its day, times and length');
check((await offerCard.innerText()).includes('Your turn: answer it'), '…and that it’s her turn to answer it');
await audit(b, 'home with an offer');
await offerCard.click();
await b.getByText(`${TITLES.lead} offers you a scene`).waitFor();
check((await whatNow(b)).includes('your turn') && (await whatNow(b)).includes(`${TITLES.lead.toLowerCase()} builds it and sends it`),
  'the offer says it’s her turn, and that once she accepts Kay builds it and sends it');
check((await b.getByText('Big day at work. Make me proud.').count()) === 1, 'Sunny reads Kay’s note (decrypted on her phone)');
check((await b.getByRole('radio', { name: /Normal/ }).getAttribute('aria-checked')) === 'true', 'she says how much she can take on (normal unless she changes it)');
await audit(b, 'an offer');
await b.getByRole('button', { name: 'Ask for a change' }).click();
await sheet(b).getByRole('button', { name: '4 hours' }).click();
check(await b.inputValue('#window-until') === '12:30', 'a shorter window is one tap (8:30 to 12:30)');
await sheet(b).getByRole('radio', { name: /Light/ }).click();
await sheet(b).getByLabel('Why, or what would work (optional)').fill('Doctor at 2, and I’m tired. Half a day, lighter?');
await audit(b, 'ask for a change');
await sheet(b).getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText('You asked for').waitFor();
check(!!await pushTo('kay', /asked for a change/), 'Kay hears Sunny asked for a change');

// ── Kay agrees ──────────────────────────────────────────────────────────────
await r.reload();
const asked = r.getByRole('region', { name: 'Change asked for' });
await asked.getByText('Doctor at 2, and I’m tired. Half a day, lighter?').waitFor();
const askedText = await asked.innerText();
check(askedText.includes('4 hours') && askedText.includes('Capacity: Light'), 'Kay sees what Sunny asked for: 4 hours, a light load, and why');
await audit(r, 'a change asked for');
await r.getByRole('button', { name: 'Agree to the change' }).click();
await r.getByText(`Agreed with ${TITLES.follow}`).waitFor();
check(!!await pushTo('sunny', /agreed to your change/), 'Sunny hears Kay agreed');
const pendingStart = async () => (await db`SELECT fire_at FROM som.timers WHERE scene_id = ${id} AND kind = 'scene_start' AND fired_at IS NULL AND cancelled_at IS NULL`)[0];
const [{ starts_at: agreedAt }] = await db`SELECT starts_at FROM som.scenes WHERE id = ${id}`;
check((await pendingStart())?.fire_at.getTime() === agreedAt.getTime() - 3_600_000, 'once agreed, a reminder for Kay to send it is set for an hour before it starts');
await db`UPDATE som.timers SET fire_at = now() WHERE scene_id = ${id} AND kind = 'scene_start' AND fired_at IS NULL AND cancelled_at IS NULL`;
check(!!await pushTo('kay', /isn’t sent yet/), '…and if it still isn’t sent by then, Kay hears it');
[scene] = await db`SELECT status, starts_at, ends_at, change_request, reply_enc FROM som.scenes WHERE id = ${id}`;
check(scene.status === 'accepted' && hours(scene) === 4 && scene.change_request === null && /^j1\./.test(scene.reply_enc), 'the scene is agreed for 4 hours; her capacity and note are stored encrypted');
check((await whatNow(r)).includes('your turn') && (await whatNow(r)).includes('now build it') && await step(r) === 'Build & send', 'once agreed, Kay’s screen says it’s her turn to build it, then send it');
await r.getByText('Capacity: Light').waitFor();
await r.getByRole('region', { name: 'Block 1: Home' }).waitFor();
check((await r.getByRole('region', { name: /^Block 2/ }).count()) === 0 && (await r.getByRole('region', { name: 'Free time at the end' }).innerText()).includes('2. Free time'),
  'Kay’s builder shows Sunny’s capacity; a light 4 hours is one block at home, then free time');

await b.reload();
await b.getByText(`${TITLES.lead} is building your scene`).waitFor();
check((await b.getByText('Capacity: Light').count()) === 1, 'meanwhile Sunny sees it’s being built, to her capacity');
check((await whatNow(b)).includes(`waiting for ${TITLES.lead.toLowerCase()}`) && (await whatNow(b)).includes('notification when it’s sent'), '…that it’s with Kay, and that she’ll hear when it’s sent');

// ── Windows don't overlap; an offer's time can pass ─────────────────────────
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: `Offer ${TITLES.follow} a scene` }).click();
await sheet(r).getByRole('button', { name: 'Send the offer' }).click();
await sheet(r).getByText('That time overlaps another scene you’ve planned.').waitFor();
const [{ n: scenes }] = await db`SELECT count(*)::int AS n FROM som.scenes WHERE pod_id = ${podId}`;
check(scenes === 1, 'Kay can’t offer a time that overlaps the agreed one (and no stray draft is left)');
await sheet(r).locator('#window-from').fill('13:00');
await sheet(r).getByRole('button', { name: '2 hours' }).click();
await sheet(r).getByRole('button', { name: 'Send the offer' }).click();
await r.waitForURL(/\/scene\//);
const later = r.url().split('/').pop();
check(later !== id, '…but the afternoon, right after it, is fine');
await db`UPDATE som.scenes SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' WHERE id = ${later}`;
await b.goto(`${BASE}/`);
await b.getByRole('link', { name: /Time passed/ }).waitFor();
check((await call(b, `/api/scenes/${later}/action`, 'POST', { action: 'accept', replyEnc: null })).status === 409, 'an offer whose time has passed can’t be accepted');
await r.goto(`${BASE}/scene/${id}`);
await r.getByText(`Agreed with ${TITLES.follow}`).waitFor();

// ── Kay fills it in and sends it ────────────────────────────────────────────
await r.getByRole('button', { name: /Fill it for me/ }).click();
const chores = r.getByRole('group', { name: 'Block 1: Two chores' });
await chores.getByText('2/2').waitFor();
if (!(await chores.getByText(LAUNDRY).count())) {
  await chores.getByRole('button', { name: /^Take out/ }).first().click();
  await pick(r, 1, 'Two chores', 'Laundry: wash');
}
await r.getByText('Saved').waitFor({ timeout: 10000 });
const filled = Number((await r.getByText(/^\d+ tasks? ·/).innerText()).match(/^(\d+)/)[1]);
check(filled === 5, `“Fill it for me” fills the block: getting ready, two chores, devotion and one for Kay (${filled} tasks)`);
check(await r.locator('#plan-checkin').inputValue() === 'blocks', '…with a check-in at the end of the block');
await audit(r, 'builder, filled in');
await r.getByRole('button', { name: `Send to ${TITLES.follow}` }).click();
await sheet(r).getByText(`gets these ${filled} tasks`).waitFor();
await audit(r, 'send it?');
await sheet(r).getByRole('button', { name: 'Send it' }).click();
await r.getByText(`${TITLES.follow} starts it; you’ll hear when.`).waitFor();
check(!!await pushTo('sunny', /sent your scene/), 'Sunny hears her scene was sent');
const timer = async () => (await db`SELECT fire_at FROM som.timers WHERE scene_id = ${id} AND kind = 'scene_start' AND fired_at IS NULL AND cancelled_at IS NULL`)[0];
const [{ starts_at }] = await db`SELECT starts_at FROM som.scenes WHERE id = ${id}`;
check((await timer())?.fire_at.getTime() === starts_at.getTime(), 'a reminder is set for the start time');

// Taking it back to change it, then sending it again.
await r.getByRole('button', { name: 'Take it back to change it' }).click();
await r.getByText(`Agreed with ${TITLES.follow}`).waitFor();
check(!!await pushTo('sunny', /took the scene back/), 'Kay can take it back to change it (Sunny is told)');
const [{ n: left }] = await db`SELECT count(*)::int AS n FROM som.tasks WHERE scene_id = ${id}`;
check(left === 0 && (await timer())?.fire_at.getTime() === starts_at.getTime() - 3_600_000, '…its tasks go, and the start reminder becomes a reminder to send it again');
await r.getByRole('button', { name: `Send to ${TITLES.follow}` }).click();
await sheet(r).getByRole('button', { name: 'Send it' }).click();
await r.getByText(`${TITLES.follow} starts it; you’ll hear when.`).waitFor();

// ── Sunny sees it and starts it in its window ───────────────────────────────
await b.goto(`${BASE}/`);
const coming = b.getByRole('link', { name: /Ready to start/ });
await coming.waitFor();
check((await coming.innerText()).includes('4 hours') && (await coming.innerText()).includes('you start it at the time'), 'Sunny’s home shows the scene coming up, with its window, and that she starts it');
await coming.click();
await b.getByRole('timer').waitFor();
check(/Starts in \d+ h \d+ min/.test(await b.getByRole('timer').innerText()), 'the ready screen counts down to the start');
check((await whatNow(b)).includes('coming up') && (await whatNow(b)).includes('you start it yourself') && await step(b) === 'Start', '…and says she starts it herself, and from when');
const list = b.getByRole('region', { name: 'The tasks' });
check((await list.getByText(LAUNDRY).count()) === 1 && (await list.getByRole('listitem').count()) === filled, `Sunny can read all ${filled} tasks before she starts`);
check((await list.getByRole('region', { name: /^Block 1\. Home/ }).innerText()).includes('–'), '…block by block, with the times');
check(await b.getByRole('button', { name: 'Start the scene' }).isDisabled() && (await b.getByText(/You can start from/).count()) === 1, 'it can’t start yet: she sees from when it can');
check((await call(b, `/api/scenes/${id}/action`, 'POST', { action: 'start' })).status === 409, '…and the server agrees');
await audit(b, 'ready to start');
// The morning comes: ten minutes before the window opens.
await db`UPDATE som.scenes SET starts_at = now() + interval '10 minutes', ends_at = now() + interval '4 hours 10 minutes' WHERE id = ${id}`;
await db`UPDATE som.timers SET fire_at = now() WHERE scene_id = ${id} AND kind = 'scene_start' AND fired_at IS NULL AND cancelled_at IS NULL`;
check(!!await pushTo('sunny', /Your scene starts now/) && !!await pushTo('kay', /scene is due to start/), 'at the start time Sunny is reminded, and Kay is told');
check((await call(b, `/api/scenes/${id}/action`, 'POST', { action: 'unsend' })).status === 409, 'Sunny can’t take it back');
await b.reload();
await b.getByRole('button', { name: 'Start the scene' }).click();
await b.getByText('Your tasks').waitFor();
check(!!await pushTo('kay', /started the scene/), 'Kay hears Sunny started (a little early is fine)');
const [blocks] = await db`SELECT checkin_minutes, checkin_blocks, checkin_at, checkin_base, next_checkin_at FROM som.scenes WHERE id = ${id}`;
check(blocks.checkin_minutes === null && blocks.checkin_blocks && blocks.checkin_at.join() === '120' && blocks.next_checkin_at - blocks.checkin_base === 120 * 1000,
  'the check-in is set for the end of the block (120 test minutes from the start)');
await b.locator('#checkin').getByText(/^End of this block/).waitFor();
check(true, 'Sunny sees when the block ends and her check-in is due');

// ── Sunny sends proof; Kay approves with praise ─────────────────────────────
await b.getByRole('button', { name: /Laundry: wash/ }).click();
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'FOLDED', '#3a7')]);
await sheet(b).getByText('1/1 photo').waitFor({ timeout: 30000 });
await sheet(b).getByRole('button', { name: 'Send for review' }).click();
await sheet(b).getByText('For review').first().waitFor();
await closeSheet(b);
check(!!await pushTo('kay', /sent something for review/), 'Kay hears the laundry is waiting for review');

await r.reload();
await r.getByRole('button', { name: 'Demand' }).waitFor();
await audit(r, 'running, with the lead’s quick actions');
await r.getByRole('region', { name: 'Waiting for review' }).getByRole('button', { name: /Laundry: wash/ }).click();
await sheet(r).getByRole('button', { name: 'Approve + praise' }).click();
await sheet(r).getByRole('button', { name: 'Perfect.' }).waitFor();
await audit(r, 'approve with praise');
await sheet(r).getByRole('button', { name: 'Perfect.' }).click();
await sheet(r).getByText('Approved').first().waitFor();
check(!!await pushTo('sunny', /praised you/) && !!await pushTo('sunny', /approved a task/), 'one tap approves it and praises her (she hears both)');

// "Ask for more" about this task: a demand that says what it's about.
await sheet(r).getByRole('button', { name: 'Ask for more' }).click();
await sheet(r).getByRole('button', { name: /Show me the detail you missed/ }).click();
check(await sheet(r).getByLabel('Details (optional)').inputValue() === `About: ${LAUNDRY}`, '“Ask for more” on a task makes a demand about that task');
await sheet(r).getByRole('button', { name: 'Send the demand' }).click();
await r.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 1);
await closeSheet(r);

// ── Demands ─────────────────────────────────────────────────────────────────
await r.getByRole('button', { name: 'Demand' }).click();
await sheet(r).getByRole('button', { name: /Self-spank ___ per cheek/ }).waitFor();
await audit(r, 'demands to pick from');
await sheet(r).getByRole('button', { name: /Self-spank ___ per cheek/ }).click();
await sheet(r).getByLabel('how many').fill('10');
check(await pressed(sheet(r).getByRole('button', { name: '5 min', exact: true })), 'a preset demand comes with its proof and countdown');
await audit(r, 'a demand');
await sheet(r).getByRole('button', { name: 'Send the demand' }).click();
await r.waitForFunction(() => !document.querySelector('dialog[open]'));
check(!!await pushTo('sunny', /sent you a demand/), 'Sunny hears she has a demand');
await r.getByRole('button', { name: 'Demand' }).click();
await sheet(r).getByRole('button', { name: /A photo, right now/ }).click();
await sheet(r).getByRole('button', { name: 'Send the demand' }).click();
await r.waitForFunction(() => !document.querySelector('dialog[open]'));
const demands = await db`SELECT status, minutes, due_at FROM som.tasks WHERE scene_id = ${id} AND ord >= ${filled} ORDER BY ord`;
check(demands.length === 3 && demands.every((d) => d.status === 'started' && d.due_at), 'demands land as tasks with their countdowns already running');
check((await call(b, `/api/scenes/${id}/tasks`, 'POST', { id: crypto.randomUUID(), bodyEnc: 'j1.x.y', minutes: 5 })).status === 409, 'Sunny can’t send demands');
check((await call(b, `/api/scenes/${id}/entries`, 'POST', { id: crypto.randomUUID(), kind: 'praise', bodyEnc: 'j1.aaaa.bbbb' })).status === 409, '…or praise');

await b.reload();
const fromKay = b.getByRole('region', { name: 'Demands' });
await fromKay.getByText('Self-spank 10 per cheek, counting aloud').waitFor();
check((await fromKay.getByRole('button').count()) === 3, 'Sunny’s demands from Kay are at the top of her screen');
await audit(b, 'running, with demands');
await fromKay.getByRole('button', { name: /A photo, right now/ }).click();
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'NOW', '#a73')]);
await sheet(b).getByText('1/1 photo').waitFor({ timeout: 30000 });
await sheet(b).getByRole('button', { name: 'Send for review' }).click();
await sheet(b).getByText('For review').first().waitFor();
await closeSheet(b);

// ── Kay sends the photo back to redo ────────────────────────────────────────
await r.reload();
await r.getByRole('region', { name: 'Waiting for review' }).getByRole('button', { name: /A photo, right now/ }).click();
await sheet(r).getByRole('button', { name: 'Send back' }).click();
await sheet(r).getByRole('button', { name: 'A better photo: closer, more light' }).click();
check(await sheet(r).getByLabel('What to fix (optional)').inputValue() === 'A better photo: closer, more light', 'a reason to redo is one tap');
await audit(r, 'send back to redo');
await sheet(r).getByRole('button', { name: 'Send it back' }).click();
await sheet(r).getByText('Sent back').first().waitFor();
await closeSheet(r);
check(!!await pushTo('sunny', /sent a task back/), 'Sunny hears it came back');

await b.reload();
await b.getByRole('region', { name: 'Demands' }).getByRole('button', { name: /A photo, right now/ }).click();
await sheet(b).getByText('A better photo: closer, more light').waitFor();
await sheet(b).locator('input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'CLOSER', '#c84')]);
await b.waitForFunction(() => document.querySelectorAll('dialog[open] button[aria-label="Open photo"]').length >= 2, null, { timeout: 30000 });
await sheet(b).getByRole('button', { name: 'Send for review' }).click();
await sheet(b).getByText('For review').first().waitFor();
await closeSheet(b);
check(true, 'Sunny sees why, and sends a better one');

// ── Praise, and on my way ───────────────────────────────────────────────────
await r.reload();
await r.getByRole('region', { name: 'Waiting for review' }).getByRole('button', { name: /A photo, right now/ }).click();
await sheet(r).getByRole('button', { name: 'Approve ✓' }).click();
await sheet(r).getByText('Approved').first().waitFor();
await closeSheet(r);
await r.getByRole('button', { name: 'Praise' }).click();
await audit(r, 'praise');
await sheet(r).getByLabel('Praise').fill('So proud of how you handled today.');
await sheet(r).getByRole('button', { name: 'Send praise' }).click();
await r.waitForFunction(() => !document.querySelector('dialog[open]'));
await b.reload();
await b.getByText('So proud of how you handled today.').waitFor();
check(true, 'Sunny sees Kay’s praise in the scene');

await r.getByRole('button', { name: /On my way/ }).click();
await audit(r, 'on my way');
await sheet(r).getByRole('button', { name: '30 min' }).click();
await r.getByRole('button', { name: /^\d+:\d\d$/ }).waitFor();
check(true, 'two taps, and Kay’s button shows the countdown home');
check(!!await pushTo('sunny', /on the way: about 30 minutes/), 'Sunny hears Kay is on the way');
await b.reload();
await b.locator('#arrival').getByText('until arrival').waitFor();
check(true, 'Sunny gets the countdown and the arrival routine');

// ── Kay lets a task go and opens it again; a photo sent on its own ──────────
const [{ id: other }] = await db`SELECT id FROM som.tasks WHERE scene_id = ${id} AND status = 'todo' ORDER BY ord DESC LIMIT 1`;
await r.goto(`${BASE}/scene/${id}#task-${other}`);
await sheet(r).getByRole('button', { name: 'Skip it' }).click();
await sheet(r).getByRole('button', { name: 'Reopen' }).waitFor();
check(!!await pushTo('sunny', /let a task go/), 'Kay lets a task go: Sunny hears she needn’t do it');
await sheet(r).getByRole('button', { name: 'Reopen' }).click();
await sheet(r).getByRole('button', { name: 'Skip it' }).waitFor();
check(!!await pushTo('sunny', /opened a task again/), '…and opens it again: Sunny hears it’s to do');
await closeSheet(r);
await b.goto(`${BASE}/scene/${id}`);
await b.locator('#notes input[type=file][accept="image/*,video/*,audio/*"]').setInputFiles([await png(b, 'NOTE', '#37a')]);
check(!!await pushTo('kay', /sent you something/), 'a photo sent on its own in the notes: Kay hears something came');

// ── Kay scores each task she set ────────────────────────────────────────────
await r.getByRole('button', { name: 'Start the inspection' }).click();
await r.getByText('Each task').waitFor();
const total = (await db`SELECT count(*)::int AS n FROM som.tasks WHERE scene_id = ${id}`)[0].n;
check(total === filled + 3, `the scorecard lists every task she set, demands included (${total})`);
await r.getByRole('radiogroup', { name: `Score for ${LAUNDRY}`, exact: true }).getByRole('radio', { name: '5' }).click();
await r.getByRole('button', { name: 'all 4s' }).click();
await r.getByText(`${total} of ${total} scored`).waitFor();
check(true, 'one score by hand, “all 4s” for the rest');
for (const cat of ['Presentation', 'Task completion', 'Quality of work', 'Attitude']) await r.getByRole('radiogroup', { name: cat, exact: true }).getByRole('radio', { name: '4' }).click();
const sum = 5 + 4 * (total - 1) + 16;
const max = 5 * (total + 4);
check((await r.getByText(`${sum} / ${max}`).count()) === 1 || (await r.getByRole('status').filter({ hasText: `${sum}` }).count()) > 0, `the scorecard adds it up (${sum} / ${max})`);
await audit(r, 'scoring each task');
await r.getByLabel('Inspection notes').fill('A good day. Lovely folding.');
await r.getByRole('button', { name: `Share with ${TITLES.follow}` }).click();
await r.getByRole('region', { name: 'Results' }).waitFor();
check(!!await pushTo('sunny', /scorecard and rewards are ready/), 'Sunny hears her scorecard and rewards are ready');

await b.reload();
const results = b.getByRole('region', { name: 'Results' });
await results.waitFor();
const text = await results.innerText();
check(text.includes(`${sum}`) && text.includes(`/ ${max}`), `Sunny sees the total (${sum} / ${max})`);
check(text.includes(LAUNDRY) && text.includes('⚡ Self-spank 10 per cheek, counting aloud') && /overall/i.test(text),
  `…and the score for each task Kay set, demands marked ⚡, then the overall scores${/overall/i.test(text) ? '' : `: ${text}`}`);
check((await results.getByLabel('5 of 5').count()) === 1, '…with the laundry at 5');
await audit(b, 'results by task');

// ── What the server holds ───────────────────────────────────────────────────
check(pushes.every((m) => !m.error), 'every notification decrypts on the phone it was meant for');
const leaks = pushes.filter((m) => /Big day|Doctor|laundry|spank|photo, right|proud|Perfect|closer|detail/i.test(`${m.title} ${m.body}`));
check(leaks.length === 0, `notifications never say what’s in the scene${leaks.length ? `: ${JSON.stringify(leaks)}` : ''}`);
const all = await databaseText();
const found = ['Big day at work', 'Doctor at 2', '"capacity"', 'lighter?', 'Laundry: wash', 'Self-spank', 'A photo, right now', 'detail you missed', 'closer, more light', 'So proud of how', 'Perfect.', 'Lovely folding', TITLES.lead]
  .filter((w) => all.includes(w));
check(found.length === 0, `nothing readable in the database${found.length ? `: ${found.join(', ')}` : ''}`);

const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
