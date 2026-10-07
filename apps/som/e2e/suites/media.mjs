// Everything that can be sent, opened on the other phone. Sunny sends, in
// the notes, a photo, a video, a voice note recorded in the app, an audio
// file, another file and a two-line note, and writes a piece for a writing
// task. Kay hears about each, opens each (decrypted on his phone): the
// photo shows, the video and both sounds play and say how long they are,
// the file is there by name, and "Save to phone" gives back the real file.
// Only Sunny can delete what she sent, and it goes from the bucket too.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BASE, bucketObjects, check, db, finish, looksReadable, newPod, pick, png, pushService, pushes, TITLES, typeIn, webm } from '../lib.mjs';

const subscribe = await pushService();
const { b, r } = await newPod();
await subscribe(b, 'sunny');
await subscribe(r, 'kay');
const sheet = (p) => p.locator('dialog[open]').last();
const closeSheet = (p) => sheet(p).getByRole('button', { name: 'Close' }).first().click();
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const pushCount = (who, re) => pushes.filter((m) => m.who === who && re.test(m.body)).length;

/** One second of a 440 Hz tone, as a WAV file. */
function wav() {
  const rate = 8000;
  const data = Buffer.alloc(rate * 2);
  for (let i = 0; i < rate; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return { name: 'humming.wav', mimeType: 'audio/wav', buffer: Buffer.concat([h, data]) };
}
const TEXT = { name: 'packing-list.txt', mimeType: 'text/plain', buffer: Buffer.from('Blue blanket\nTwo glasses\nThe good candle\n') };

// ── A running scene with a writing task ─────────────────────────────────────
await b.goto(`${BASE}/`);
await b.getByRole('button', { name: 'New scene' }).click();
await b.waitForURL(/\/scene\//);
const id = b.url().split('/').pop();
await pick(b, 1, `For ${TITLES.lead}`, 'Write me a sonnet');
await b.getByText('Saved').waitFor({ timeout: 10000 });
await b.getByRole('button', { name: `Send to ${TITLES.lead}` }).click();
await b.getByText(`Sent to ${TITLES.lead}`).waitFor();
await r.goto(`${BASE}/scene/${id}`);
await r.getByRole('button', { name: 'Start now' }).click();
await sheet(r).getByRole('button', { name: 'Start now' }).click();
await r.getByText(`${TITLES.follow}’s tasks`).waitFor();

// ── Sunny sends one of everything ───────────────────────────────────────────
await b.reload();
const notes = b.locator('#notes');
await notes.waitFor();
const photo = await png(b, 'PICNIC', '#c73');
const video = await webm(b);
const audio = wav();
const sent = async (accept, file) => notes.locator(`input[type=file][accept="${accept}"]`).first().setInputFiles([file]);
await sent('image/*', photo);
await sent('video/*', video);
await sent('image/*,video/*,audio/*', audio);
await sent('*/*', TEXT);
await notes.getByRole('button', { name: '🎙 Voice' }).click();
await b.waitForTimeout(2200);
await notes.getByRole('button', { name: /Stop/ }).click();
check(await typeIn(notes.getByRole('textbox', { name: 'Note', exact: true }), 'Bringing the blanket.\nAnd the good candle.') === 'Bringing the blanket.\nAnd the good candle.', 'a note can be two lines');
await notes.getByRole('button', { name: 'Send note' }).click();
await notes.getByText('And the good candle.').waitFor();
await b.waitForFunction(() => document.querySelectorAll('#notes button[aria-label^="Open "]').length >= 5, null, { timeout: 60000 });
const tiles = await notes.locator('button[aria-label^="Open "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).sort());
check(tiles.join() === 'Open audio,Open audio,Open file,Open photo,Open video', `each one arrives as what it is (${tiles.join(', ')})`);
await notes.getByRole('button', { name: 'Open file', exact: true }).getByText(TEXT.name).waitFor();
check(true, 'the file’s tile shows its name');
const lengths = await notes.locator('button[aria-label="Open audio"]').allInnerTexts();
check(lengths.length === 2 && lengths.every((t) => /\d+:\d\d$/.test(t.trim())), `both sounds say how long they are, the recording too (${lengths.map((t) => t.trim().split(/\s+/).pop()).join(', ')})`);

// A writing task: one long piece.
await b.getByRole('button', { name: /Write me a sonnet/ }).first().click();
const piece = 'Two kettles on, one cup of tea,\nyou pour for us, I pour for me.';
check(await typeIn(sheet(b).getByLabel('Your writing'), piece) === piece, 'a writing task takes a long piece, line by line');
await sheet(b).getByRole('button', { name: 'Send writing' }).click();
await sheet(b).getByText('you pour for us, I pour for me.').waitFor();
await sheet(b).getByRole('button', { name: 'Send for review' }).click();
await sheet(b).getByText('For review').first().waitFor();
await closeSheet(b);

// ── Kay hears about each, and opens each ────────────────────────────────────
const deadline = Date.now() + 20000;
while (pushCount('kay', /sent you something/) < 5 && Date.now() < deadline) await new Promise((res) => setTimeout(res, 300));
check(pushCount('kay', /sent you something/) >= 5 && pushCount('kay', /New note from Sunny/) >= 1 && pushCount('kay', /sent something for review/) >= 1,
  'Kay hears about each thing sent, the note, and the writing sent for review');
await r.reload();
const kayNotes = r.locator('#notes');
await kayNotes.getByText('And the good candle.').waitFor();
check((await kayNotes.locator('p', { hasText: 'Bringing the blanket.' }).innerText()).includes('\n'), 'Kay reads the note on two lines');
const open = async (label, n = 0) => {
  await kayNotes.getByRole('button', { name: label, exact: true }).nth(n).click();
  await sheet(r).getByText('Decrypted on this phone only').waitFor();
  await sheet(r).getByText('Decrypting…').waitFor({ state: 'detached', timeout: 15000 });
};
const saved = async () => {
  const [dl] = await Promise.all([r.waitForEvent('download'), sheet(r).getByRole('button', { name: 'Save to phone' }).click()]);
  return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
};

await open('Open photo');
await sheet(r).locator('img').waitFor();
check(await sheet(r).locator('img').evaluate((img) => img.complete && img.naturalWidth > 0), 'the photo opens on Kay’s phone');
const savedPhoto = await saved();
check(savedPhoto.bytes.subarray(0, 3).toString('hex') === 'ffd8ff' && savedPhoto.name.endsWith('.jpg'), '…and saves as a JPEG (redrawn on Sunny’s phone: no location or camera details)');
check((await sheet(r).getByRole('button', { name: 'Delete' }).count()) === 0, 'Kay can’t delete what Sunny sent');
await closeSheet(r);

await open('Open video');
const playable = (sel) => sheet(r).locator(sel).evaluate((el) => new Promise((res) => {
  const ok = () => res({ ok: true, w: el.videoWidth ?? 0 });
  if (el.readyState >= 1) ok();
  el.addEventListener('loadedmetadata', ok, { once: true });
  el.addEventListener('error', () => res({ ok: false }), { once: true });
  setTimeout(() => res({ ok: false }), 10000);
}));
const v = await playable('video');
check(v.ok && v.w > 0, 'the video loads and has a picture');
check(await sheet(r).locator('video').evaluate(async (el) => { el.muted = true; await el.play(); await new Promise((res) => setTimeout(res, 600)); return el.currentTime > 0; }), '…and plays');
check(sha((await saved()).bytes) === sha(video.buffer), '…and saves as the very same file');
await closeSheet(r);

for (const n of [0, 1]) {
  await open('Open audio', n);
  const a = await playable('audio');
  check(a.ok, `sound ${n + 1} of 2 loads on Kay’s phone`);
  check(await sheet(r).locator('audio').evaluate(async (el) => { await el.play(); await new Promise((res) => setTimeout(res, 500)); return el.currentTime > 0; }), '…and plays');
  const back = await saved();
  if (back.name === audio.name) check(sha(back.bytes) === sha(audio.buffer), '…the audio file saves as the very same file');
  else check(back.name.startsWith('voice-') && back.bytes.length > 1000, `…the voice note saves too (${back.name})`);
  await closeSheet(r);
}

await open('Open file');
check((await sheet(r).getByText(TEXT.name).count()) === 1 && (await sheet(r).getByText(`${TEXT.buffer.length} bytes`).count()) === 1, 'another file shows by its name and size');
const savedFile = await saved();
check(savedFile.name === TEXT.name && savedFile.bytes.equals(TEXT.buffer), '…and saves as the very same file');
await closeSheet(r);

await r.getByRole('button', { name: /Write me a sonnet/ }).first().click();
check((await sheet(r).getByText('you pour for us, I pour for me.').count()) === 1, 'Kay reads the writing in the task, line by line');
await sheet(r).getByRole('button', { name: 'Approve ✓' }).click();
await sheet(r).getByText('Approved').first().waitFor();
await closeSheet(r);

// ── Sunny deletes one of hers: gone for both, and from the bucket ───────────
const before = bucketObjects(`s/${id}`).length;
await b.reload();
await notes.getByRole('button', { name: 'Open file', exact: true }).filter({ hasText: TEXT.name }).click();
await sheet(b).getByRole('button', { name: 'Delete' }).click();
await b.waitForFunction(() => !document.querySelector('#notes button[aria-label="Open file"]'), null, { timeout: 10000 });
check(b.dialogs.some((d) => d.includes('Delete this for both of you')), 'Sunny can delete what she sent (it asks first)');
await r.reload();
await kayNotes.getByText('And the good candle.').waitFor();
await r.waitForFunction(() => document.querySelectorAll('#notes button[aria-label^="Open "]').length >= 4 && !document.querySelector('#notes [aria-label="Opening…"]'), null, { timeout: 15000 });
check((await kayNotes.getByRole('button', { name: 'Open file', exact: true }).count()) === 0, '…and it’s gone from Kay’s phone');
check(bucketObjects(`s/${id}`).length < before, '…and from the bucket');

// ── At rest ─────────────────────────────────────────────────────────────────
const objects = bucketObjects(`s/${id}`);
check(objects.length >= 5 && objects.every((f) => !looksReadable(f)), `the bucket holds only ciphertext (${objects.length} objects)`);
const [{ n: plain }] = await db`SELECT count(*)::int AS n FROM som.media WHERE scene_id = ${id} AND meta_enc NOT LIKE 'j1.%'`;
check(plain === 0, 'file names, types and lengths are stored encrypted');
check(pushes.every((m) => !m.error) && !pushes.some((m) => /picnic|blanket|candle|kettle|humming|packing/i.test(`${m.title} ${m.body}`)), 'notifications decrypt on the right phone and never say what was sent');
const errors = [...b.errors, ...r.errors];
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
await finish();
