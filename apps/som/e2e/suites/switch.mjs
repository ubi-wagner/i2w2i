// Switching, on two small phones. Kay (who usually leads) adds roleplays to
// the menu and asks Sunny for one where Sunny leads; they talk it over,
// Sunny accepts and it's on. In that scene everything follows the switch:
// Sunny has the lead's controls and sends a demand, Kay gets it. A roleplay
// has no inspection, scores or rewards: Sunny ends it straight into
// aftercare, which starts with the roleplay's own, and both say what they
// loved and didn't. A roleplay Kay marked "not for me" can't be asked for.
// Then Sunny asks Kay for a scene and Kay says not this time. Every new screen is checked on the small phone; nothing
// readable reaches the database or a notification.
import { audit, BASE, call, check, databaseText, db, finish, newPod, pushService, pushTo, pushes, SMALL, TITLES } from '../lib.mjs';

console.log(`on ${SMALL}`);
const subscribe = await pushService();
const { b, r, lead } = await newPod(SMALL);
await subscribe(b, 'sunny');
await subscribe(r, 'kay');
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = async (p) => { await sheet(p).getByRole('button', { name: 'Close' }).first().click(); };
const idOf = async (username) => (await db`SELECT id FROM som.accounts WHERE username = ${username}`)[0].id;
const kayId = await idOf(lead.username);

// ── Kay adds roleplays, and a title for Sunny when they switch ───────────────
const ROLEPLAYS = `## Indoor
- The night shift
  Leads: {follow}
  Location: Kitchen | Intensity: Playful
  Attire: Apron (Kay); a clipboard (Sunny)
  Setup: Kay arrives late for her shift and has to make up for it.
  Action: Sunny gives the orders and sets the pace.
  Aftercare: Tea on the couch, feet up.
- Breakfast service
  Leads: ${TITLES.lead}
  Location: Kitchen
  Setup: Warm plates, low music.
`;
await r.goto(`${BASE}/menu`);
await r.getByRole('button', { name: /^Roleplays/ }).click();
await r.getByLabel('Import roleplays').setInputFiles({ name: 'roleplays.txt', mimeType: 'text/plain', buffer: Buffer.from(ROLEPLAYS) });
await r.getByRole('button', { name: /The night shift/ }).waitFor();
check(r.dialogs.some((d) => d.includes('Add 2 roleplays')), 'roleplays come in from a text file (asks first)');
await r.fill('#m-switch-lead', 'Sir');
await r.getByRole('button', { name: 'Save menu' }).click();
await r.getByText('Saved.').waitFor();
check((await r.getByText('Sir leads ⇄').count()) === 1 && (await r.getByText(`${TITLES.lead} leads`).count()) === 1, 'each says who leads; one led by Sunny is a switch');
await audit(r, 'roleplays on the menu');
await r.getByRole('button', { name: /The night shift/ }).click();
check(await sheet(r).getByLabel('The setup').inputValue() === 'Kay arrives late for her shift and has to make up for it.', 'a roleplay opens to edit, field by field');
await audit(r, 'edit a roleplay');
await closeSheet(r);
await r.getByRole('button', { name: /Breakfast service/ }).click();
await sheet(r).getByRole('radiogroup', { name: 'How you feel about it' }).getByRole('radio', { name: /Not for me/ }).click();
await sheet(r).locator('[role=radio][aria-checked=true]', { hasText: 'Not for me' }).waitFor();
await closeSheet(r);
await r.getByText('You 👎').waitFor();
check(true, 'Kay says how she feels about a roleplay with one tap, before ever playing it (“not for me”)');

// ── Kay asks Sunny for a roleplay where Sunny leads ─────────────────────────
// Asking for a roleplay is its own thing, apart from a Select-O-Matic scene:
// every roleplay is there, each saying who leads it.
await r.goto(`${BASE}/`);
await r.getByRole('button', { name: '🎭 Ask for a roleplay' }).click();
const nightShift = sheet(r).getByRole('radio', { name: /The night shift/ });
check((await sheet(r).getByRole('radio', { name: /Breakfast service/ }).innerText()).includes('You lead') && (await nightShift.innerText()).includes('Sunny leads ⇄'),
  'asking for a roleplay is its own sheet: every roleplay, each saying who leads it');
await nightShift.click();
await sheet(r).getByText('Sunny leads this one ⇄ a switch.').waitFor();
await sheet(r).getByLabel('A note for Sunny (optional)').fill('Your turn, tomorrow morning.');
await audit(r, 'ask for a switched roleplay');
await sheet(r).getByRole('button', { name: 'Send it to Sunny' }).click();
await r.waitForURL(/\/scene\//);
const id = r.url().split('/').pop();
await r.getByText('You’d like this roleplay').waitFor();
check(!!await pushTo('sunny', /asked you for a scene/), 'Sunny hears Kay asked her for a scene');
let [scene] = await db`SELECT status, switched, offered_by FROM som.scenes WHERE id = ${id}`;
check(scene.status === 'offered' && scene.switched && scene.offered_by === kayId, 'picking one Sunny leads switches the scene, and Kay is the one who asked');
check((await call(r, `/api/scenes/${id}/action`, 'POST', { action: 'accept' })).status === 409, 'Kay can’t accept her own request');
await r.goto(`${BASE}/`);
const kayRoleplays = r.locator('section', { has: r.getByRole('heading', { name: 'Roleplays', exact: true }) });
await kayRoleplays.getByRole('link', { name: /The night shift/ }).waitFor();
check((await r.getByRole('link', { name: /The night shift/ }).count()) === 1, 'on Kay’s home it waits under Roleplays, apart from her scenes');

// ── Sunny reads it, they talk it over, she says yes: it's on ────────────────
await b.goto(`${BASE}/`);
const card = b.getByRole('link', { name: /The night shift/ });
await card.waitFor();
check((await card.innerText()).includes('⇄ Switched'), 'Sunny’s home shows it to answer, marked as a switch');
await card.click();
await b.getByText('Kay would like this roleplay').waitFor();
check((await b.getByText('⇄ Switched: Sir leads, Kay follows').count()) === 1, 'in the scene, the titles are the switched ones (Sir; Kay by name)');
check((await b.getByRole('radio', { name: /Normal/ }).count()) === 0, 'nobody is asked about capacity for a roleplay');
check((await b.getByText('Sunny gives the orders and sets the pace.').count()) === 1, 'Sunny reads all of the roleplay before answering, decrypted on her phone');
await b.getByLabel('Note', { exact: true }).fill('Can we start at nine instead?');
await b.getByRole('button', { name: 'Send note' }).click();
await b.getByText('Can we start at nine instead?').waitFor();
check(!!await pushTo('kay', /New note from Sunny/), 'they talk it over on the scene before saying yes (Kay hears a note came)');
await r.goto(`${BASE}/scene/${id}`);
await r.getByRole('heading', { name: 'Talk it over' }).waitFor();
await r.getByText('Can we start at nine instead?').waitFor();
check(true, '…and Kay reads it there');
await audit(b, 'a switched roleplay to answer');
await b.getByRole('button', { name: 'Accept: it’s on' }).click();
await b.getByRole('button', { name: 'Start the scene' }).waitFor();
[scene] = await db`SELECT status FROM som.scenes WHERE id = ${id}`;
check(scene.status === 'ready', 'her yes means it’s on: nothing to build');
check(!!await pushTo('kay', /accepted\. It’s on/), 'Kay hears it’s on');

// ── Kay starts it when it's time ────────────────────────────────────────────
await r.reload();
await r.getByRole('button', { name: 'Start the scene' }).waitFor();
check(await r.getByRole('button', { name: 'Start the scene' }).isDisabled(), 'it can’t start until its time');
await audit(r, 'a roleplay ready to start');
await db`UPDATE som.scenes SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '2 hours' WHERE id = ${id}`;
await r.reload();
await r.getByRole('button', { name: 'Start the scene' }).click();
await r.getByText('Kay arrives late for her shift and has to make up for it.').waitFor();
check(!!await pushTo('sunny', /started the scene/), 'Sunny hears Kay started it');

// ── In the scene, the roles are switched ────────────────────────────────────
check((await r.getByRole('button', { name: 'Demand' }).count()) === 0 && (await r.getByText('Your tasks').count()) === 0, 'Kay follows: no lead controls, no empty task list');
await audit(r, 'a switched roleplay running (follow)');
check((await call(r, `/api/scenes/${id}/tasks`, 'POST', { id: crypto.randomUUID(), bodyEnc: 'j1.aaaa.bbbb', minutes: 5 })).status === 409, 'Kay can’t send demands in it');
await b.reload();
await b.getByRole('button', { name: 'Demand' }).click();
await sheet(b).getByRole('button', { name: /A photo, right now/ }).click();
await sheet(b).getByRole('button', { name: 'Send the demand' }).click();
await b.waitForFunction(() => !document.querySelector('dialog[open]'));
check(!!await pushTo('kay', /sent you a demand/), 'Sunny leads: her demand goes to Kay');
await b.getByRole('button', { name: 'Praise' }).click();
await sheet(b).getByRole('button', { name: 'Perfect.' }).click();
check(!!await pushTo('kay', /praised you/), '…and so does her praise');
await audit(b, 'a switched roleplay running (lead)');
await r.reload();
await r.getByRole('region', { name: 'Demands' }).getByText('A photo, right now').waitFor();
check(true, 'Kay sees the demand at the top of her screen');

// ── No inspection: straight into aftercare, where both say what they loved ─
check((await b.getByRole('button', { name: 'Start the inspection' }).count()) === 0, 'a roleplay has no inspection: no scores, no rewards');
check((await call(b, `/api/scenes/${id}/action`, 'POST', { action: 'inspect' })).status === 409, '…and the server refuses one');
check((await call(r, `/api/scenes/${id}/action`, 'POST', { action: 'aftercare' })).status === 409, 'only Sunny, who leads it, ends it');
await b.getByRole('button', { name: 'Time for aftercare' }).click();
await b.getByText('Back to us').first().waitFor();
check((await b.getByText('Tea on the couch, feet up.').count()) === 1, 'Sunny ends it straight into aftercare, which starts with the roleplay’s own');
check(!!await pushTo('kay', /Time for aftercare/), 'Kay hears it’s aftercare');
check((await b.getByRole('region', { name: 'Results' }).count()) === 0 && (await b.getByText('The scorecard and tasks').count()) === 0, 'no scorecard and no rewards');
const feelings = (p) => p.getByRole('region', { name: 'Loves and dislikes' });
await feelings(b).getByRole('radio', { name: /Love it/ }).click();
await feelings(b).getByLabel('What you loved').fill('The pace, and the clipboard.');
await feelings(b).getByRole('button', { name: 'Save words' }).click();
await feelings(b).getByText('Saved', { exact: true }).waitFor();
await audit(b, 'aftercare after a roleplay');
await r.goto(`${BASE}/scene/${id}`);
await feelings(r).getByRole('radio', { name: /Love it/ }).click();
await feelings(r).getByLabel('What you didn’t love').fill('The apron was itchy.');
await feelings(r).getByRole('button', { name: 'Save words' }).click();
await feelings(r).getByText('Saved', { exact: true }).waitFor();
const sunnySays = await r.getByRole('group', { name: 'Sir’s loves and dislikes' }).innerText();
check(sunnySays.includes('❤️ Love it') && sunnySays.includes('The pace, and the clipboard.'), 'in aftercare each says what they loved and didn’t; Kay sees what Sunny loved');
await audit(r, 'loves and dislikes');
await b.reload();
const kaySays = await b.getByRole('group', { name: 'Kay’s loves and dislikes' }).innerText();
check(kaySays.includes('❤️ Love it') && kaySays.includes('The apron was itchy.'), '…and Sunny what Kay didn’t');
await b.getByRole('button', { name: 'I’m back to us' }).click();
await b.getByText('You’re back to us').waitFor();
await r.reload();
await r.getByRole('button', { name: 'I’m back to us' }).click();
await r.getByText(/tasks approved/).waitFor({ timeout: 10000 });
[scene] = await db`SELECT status FROM som.scenes WHERE id = ${id}`;
check(scene.status === 'closed' && (await r.getByRole('region', { name: 'Roleplay' }).count()) === 1 && (await r.getByRole('region', { name: 'Results' }).count()) === 0,
  'when both are back to us it closes; the record shows the roleplay, and no scorecard');

// ── Sunny asks Kay for a scene; Kay says not this time ──────────────────────
await b.goto(`${BASE}/us`);
await b.getByRole('tab', { name: 'Together' }).click();
check((await b.getByRole('list', { name: 'Roleplays you both love' }).innerText()).includes('The night shift'), 'Together lists the roleplays they both love');
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: '🎭 Ask for a roleplay' }).click();
const notForKay = sheet(b).getByRole('radio', { name: /Breakfast service/ });
await notForKay.getByText('👎 Not for Kay').waitFor();
check(await notForKay.isDisabled() && (await notForKay.innerText()).includes('Not for Kay'), 'a roleplay Kay said isn’t for her can’t be asked for');
await closeSheet(b);
await b.getByRole('button', { name: `Ask ${TITLES.lead} for a scene` }).click();
check(await pressed(sheet(b).getByRole('button', { name: 'Kay leads' })), 'when Sunny asks for a scene, Kay leads unless she says otherwise');
check((await sheet(b).getByRole('button', { name: /A roleplay/ }).count()) === 0, 'a scene from the menu and a roleplay are asked for separately');
await sheet(b).getByRole('button', { name: 'Send the request' }).click();
await b.waitForURL(/\/scene\//);
const asked = b.url().split('/').pop();
check(!!await pushTo('kay', /asked you for a scene/), 'Kay hears Sunny asked for a scene');
await r.goto(`${BASE}/scene/${asked}`);
await r.getByText(`${TITLES.follow} asks you for a scene`).waitFor();
await r.getByRole('button', { name: 'Not this time' }).click();
await r.getByRole('button', { name: 'Not this time' }).waitFor({ state: 'detached' });
[scene] = await db`SELECT status, switched FROM som.scenes WHERE id = ${asked}`;
check(scene.status === 'draft' && !scene.switched, 'Kay can say no; it goes back to Sunny');
check(!!await pushTo('sunny', /can’t this time/), 'Sunny hears, kindly');

// ── What the server holds ───────────────────────────────────────────────────
check(pushes.every((m) => !m.error), 'every notification decrypts on the phone it was meant for');
const leaks = pushes.filter((m) => /night shift|breakfast|late for her|tea on|Sir|photo/i.test(`${m.title} ${m.body}`));
check(leaks.length === 0, `notifications never say what’s in the scene${leaks.length ? `: ${JSON.stringify(leaks)}` : ''}`);
const all = await databaseText();
const found = ['The night shift', 'Breakfast service', 'start at nine', 'late for her shift', 'Tea on the couch', 'Your turn, tomorrow', 'clipboard (Sunny)', '"switchTitles"', '"roleplay":{', '"setup":', 'The pace, and the clipboard', 'apron was itchy', '"loved"'].filter((w) => all.includes(w));
check(found.length === 0, `nothing readable in the database${found.length ? `: ${found.join(', ')}` : ''}`);
const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();

async function pressed(l) { return (await l.getAttribute('aria-pressed')) === 'true'; }
