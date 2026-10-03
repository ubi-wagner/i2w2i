// Selecting groups of photos: all, by person, by day; zip downloads; bulk moderation.
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RUN, adminPage, check, createCode, createEvent, finish, fixture, joinWithCode, phonePage, tiles, uploadFiles } from '../lib.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'i2w2i-e2e-'));
const slug = `select-${RUN}`;
const host = await adminPage();
const ev = await createEvent(host, `Select ${RUN}`, slug);
await createCode(host, ev, 'SEL1');

const gina = await phonePage();
await joinWithCode(gina, slug, 'Gina', 'SEL1');
await uploadFiles(gina, [fixture('landscape-gps.jpg'), fixture('portrait.jpg')]);
const hal = await phonePage('pixel');
await joinWithCode(hal, slug, 'Hal', 'SEL1');
await uploadFiles(hal, [fixture('portrait.jpg'), fixture('clip.mp4')]);
await gina.reload();

const unzip = async (dl, name) => {
  const f = join(tmp, name);
  await dl.saveAs(f);
  const dir = join(tmp, `${name}.d`);
  execSync(`mkdir -p "${dir}" && cd "${dir}" && unzip -q "${f}"`);
  return readdirSync(dir).map((n) => `${statSync(join(dir, n)).size} ${n}`);
};

await gina.getByRole('button', { name: 'Select', exact: true }).click();
await gina.getByRole('button', { name: 'All', exact: true }).click();
check(await gina.getByText('4 selected').isVisible(), 'guest selects all');
const [gz] = await Promise.all([gina.waitForEvent('download'), gina.getByRole('button', { name: /^Download/ }).click()]);
const gFiles = await unzip(gz, 'guest.zip');
check(gFiles.length === 4 && gFiles.some((l) => /Gina 01\.jpg/.test(l)) && gFiles.some((l) => /Hal 0\d\.mp4/.test(l)), 'guest zip has all 4, readably named');
const halPhoto = gFiles.find((l) => /Hal 0\d\.jpg/.test(l));
check(halPhoto && Number(halPhoto.split(' ')[0]) < Number(execSync(`stat -c %s ${fixture('portrait.jpg')}`).toString()), 'other people’s photos come as the gallery copy');
const ginaOrig = gFiles.find((l) => /Gina 0\d\.jpg/.test(l) && l.startsWith('88211 '));
check(Boolean(ginaOrig), 'your own photos come as originals');

await host.goto(ev.manage);
await host.getByRole('button', { name: 'Select', exact: true }).click();
await host.getByLabel('Select everything from one person').selectOption('Hal');
check(await host.getByText('2 selected').isVisible(), 'host selects everything from one person');
await host.getByRole('button', { name: 'Star', exact: true }).click();
await host.waitForTimeout(800);
check((await host.locator('main li span', { hasText: '★' }).count()) === 2, 'bulk star');
await host.getByRole('button', { name: 'None', exact: true }).click();
await host.getByRole('button', { name: 'Select day' }).first().click();
check(await host.getByText('4 selected').isVisible(), 'select by day');
const [hz] = await Promise.all([host.waitForEvent('download'), host.getByRole('button', { name: /^Download/ }).click()]);
const hFiles = await unzip(hz, 'host.zip');
check(hFiles.some((l) => l.startsWith('847549 ')) && hFiles.some((l) => l.startsWith('77528 ')), 'host zip has untouched originals');
await host.getByRole('button', { name: 'None', exact: true }).click();
await host.getByLabel('Select everything from one person').selectOption('Gina');
await host.getByRole('button', { name: 'Hide', exact: true }).click();
await host.waitForTimeout(800);
const viewer = await phonePage();
await joinWithCode(viewer, slug, 'Viewer', 'SEL1');
check((await tiles(viewer).count()) === 2, 'bulk hide takes them out of the album');
host.once('dialog', (d) => d.accept());
await host.getByRole('button', { name: 'Delete', exact: true }).click();
await host.waitForTimeout(1000);
await host.reload();
check((await tiles(host).count()) === 2, 'bulk delete removes them for good');
await finish();
