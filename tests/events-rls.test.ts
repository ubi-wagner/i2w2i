import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDatabaseUrl, ownerDatabaseUrl } from '@/db/urls.mjs';
import { codeHmac, normalizeCode, qrHash, qrToken } from '@/lib/events/codes';

// Exercises the row-level security in db/migrations/003_events.sql as the
// app role, the way the server connects. Needs a migrated database and
// APP_DB_PASSWORD (CI provides both); skipped otherwise.
const enabled = Boolean(process.env.DATABASE_URL && process.env.APP_DB_PASSWORD);

interface Ctx {
  userId?: string;
  admin?: boolean;
  guest?: { id: string; eventId: string; canUpload: boolean; canView: boolean };
}

describe.skipIf(!enabled)('events row-level security', () => {
  const owner = postgres(ownerDatabaseUrl()!, { max: 2, onnotice: () => {} });
  const app = postgres(appDatabaseUrl()!, { max: 2, onnotice: () => {} });

  function as<T>(ctx: Ctx, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    return app.begin(async (tx) => {
      await tx`SELECT set_config('app.user_id', ${ctx.userId ?? ''}, true),
                      set_config('app.is_admin', ${ctx.admin ? 'true' : ''}, true),
                      set_config('app.guest_id', ${ctx.guest?.id ?? ''}, true),
                      set_config('app.event_id', ${ctx.guest?.eventId ?? ''}, true),
                      set_config('app.can_upload', ${ctx.guest?.canUpload ? 'true' : ''}, true),
                      set_config('app.can_view', ${ctx.guest?.canView ? 'true' : ''}, true)`;
      return fn(tx);
    }) as Promise<T>;
  }

  const run = randomBytes(4).toString('hex');
  const ids: Record<string, string> = {};
  let familyId: string;

  async function user(name: string, role: 'admin' | 'creator' | 'member', family = true) {
    const [u] = await owner`INSERT INTO core.users (email, display_name, platform_role)
                            VALUES (${`${name}-${run}@example.com`}, ${name}, ${role}) RETURNING id`;
    if (family) await owner`INSERT INTO core.family_members (family_id, user_id) VALUES (${familyId}, ${u!.id})`;
    ids[name] = u!.id;
    return u!.id as string;
  }

  async function createEvent(creator: string, slug: string) {
    return as({ userId: creator }, async (tx) => {
      const [e] = await tx`INSERT INTO events.events (slug, title, created_by)
                           VALUES (${slug}, ${slug}, ${creator}) RETURNING id`;
      await tx`INSERT INTO events.members (event_id, user_id, role) VALUES (${e!.id}, ${creator}, 'owner')`;
      return e!.id as string;
    });
  }

  async function addCode(eventId: string, code: string, scope: { upload: boolean; view: boolean }) {
    const id = randomUUID();
    const token = qrToken(id, 1);
    await as({ userId: ids.cara }, (tx) => tx`
      INSERT INTO events.access_codes (id, event_id, code_hmac, qr_hash, can_upload, can_view)
      VALUES (${id}, ${eventId}, ${codeHmac(normalizeCode(code)!)}, ${qrHash(token)}, ${scope.upload}, ${scope.view})`);
    return { id, token };
  }

  async function guestFor(slug: string, code: string, name: string) {
    const [c] = await app`SELECT * FROM events.resolve_code(${slug}, ${codeHmac(normalizeCode(code)!)})`;
    const token = randomBytes(32);
    const [g] = await app`SELECT events.create_guest(${c!.access_code_id}, 'code', ${name}, ${token}) AS id`;
    return { id: g!.id as string, eventId: c!.event_id as string, canUpload: c!.can_upload as boolean, canView: c!.can_view as boolean, token };
  }

  function upload(eventId: string, by: { userId?: string; guestId?: string }, extra: Record<string, unknown> = {}) {
    return {
      event_id: eventId,
      uploader_user_id: by.userId ?? null,
      uploader_guest_id: by.guestId ?? null,
      uploader_name: 'x',
      kind: 'photo',
      content_type: 'image/jpeg',
      size_bytes: 10,
      original_key: `${eventId}/${randomUUID()}/original.jpg`,
      ...extra,
    };
  }

  let shower: string; // draft, then published with audience changes
  let other: string;

  beforeAll(async () => {
    const [fam] = await owner`SELECT id FROM core.families LIMIT 1`;
    familyId = fam
      ? (fam.id as string)
      : ((await owner`INSERT INTO core.families (slug, name) VALUES ('family', 'Family') RETURNING id`)[0]!.id as string);
    await user('cara', 'creator');
    await user('mia', 'member');
    await user('otto', 'member', false);
    await user('fay', 'member');
    await user('ada', 'admin');
    shower = await createEvent(ids.cara!, `shower-${run}`);
    other = await createEvent(ids.cara!, `other-${run}`);
    await as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.members (event_id, user_id, role) VALUES (${shower}, ${ids.mia}, 'invitee')`);
  });

  afterAll(async () => {
    await owner`DELETE FROM events.events WHERE slug LIKE ${`%-${run}`}`;
    await owner`DELETE FROM core.users WHERE email LIKE ${`%-${run}@example.com`}`;
    await Promise.all([owner.end(), app.end()]);
  });

  it('lets creators create events but not members', async () => {
    await expect(createEvent(ids.mia!, `nope-${run}`)).rejects.toThrow(/row-level security/);
  });

  it('hides draft events from everyone but members and admin', async () => {
    const seen = (ctx: Ctx) => as(ctx, (tx) => tx`SELECT id FROM events.events WHERE id = ${shower}`).then((r) => r.length);
    expect(await seen({ userId: ids.mia })).toBe(1);
    expect(await seen({ userId: ids.otto })).toBe(0);
    expect(await seen({ userId: ids.fay })).toBe(0);
    expect(await seen({})).toBe(0);
    expect(await seen({ userId: ids.ada, admin: true })).toBe(1);
  });

  it('lets only owners manage people and codes', async () => {
    await expect(
      as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.members (event_id, user_id, role) VALUES (${shower}, ${ids.otto}, 'invitee')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.access_codes (event_id, code_hmac) VALUES (${shower}, ${codeHmac('MIAS')})`),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses uploads from a guest whose code is view-only', async () => {
    await addCode(shower, 'VIEW-ONLY', { upload: false, view: true });
    const g = await guestFor(`shower-${run}`, 'view only', 'Vera');
    expect(g.canUpload).toBe(false);
    await expect(
      as({ guest: g }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { guestId: g.id }))}`),
    ).rejects.toThrow(/row-level security/);
  });

  it('lets an upload-only guest add and see their own uploads but nobody else’s', async () => {
    await addCode(shower, 'CB1106', { upload: true, view: false });
    const g = await guestFor(`shower-${run}`, 'cb1106', 'Bea');
    await as({ guest: g }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { guestId: g.id }))}`);
    await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }, { status: 'ready' }))}`);
    const mine = await as({ guest: g }, (tx) => tx`SELECT uploader_guest_id FROM events.uploads WHERE event_id = ${shower}`);
    expect(mine.length).toBe(1);
    expect(mine[0]!.uploader_guest_id).toBe(g.id);
  });

  it('keeps a guest inside their own event', async () => {
    const g = await guestFor(`shower-${run}`, 'CB1106', 'Bea2');
    await expect(
      as({ guest: g }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(other, { guestId: g.id }))}`),
    ).rejects.toThrow(/row-level security/);
    expect((await as({ guest: g }, (tx) => tx`SELECT id FROM events.events WHERE id = ${other}`)).length).toBe(0);
    // A guest token for one event doesn't open another.
    expect((await app`SELECT * FROM events.resolve_guest(${g.token}, ${other})`).length).toBe(0);
  });

  it('stops uploaders from featuring or hiding their own uploads, or moving them', async () => {
    const [u] = await as({ userId: ids.mia }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }))} RETURNING id`);
    await expect(as({ userId: ids.mia }, (tx) => tx`UPDATE events.uploads SET featured = true WHERE id = ${u!.id}`)).rejects.toThrow(
      /row-level security/,
    );
    await expect(as({ userId: ids.mia }, (tx) => tx`UPDATE events.uploads SET event_id = ${other} WHERE id = ${u!.id}`)).rejects.toThrow(
      /row-level security/,
    );
    const done = await as({ userId: ids.mia }, (tx) => tx`UPDATE events.uploads SET status = 'ready' WHERE id = ${u!.id} RETURNING id`);
    expect(done.length).toBe(1);
    const featured = await as({ userId: ids.cara }, (tx) => tx`UPDATE events.uploads SET featured = true WHERE id = ${u!.id} RETURNING id`);
    expect(featured.length).toBe(1);
  });

  it('ends sessions when the credential they used is revoked', async () => {
    const { id, token } = await addCode(other, 'REVOKE-ME', { upload: true, view: true });
    const viaCode = await guestFor(`other-${run}`, 'REVOKE-ME', 'Ray');
    const [qr] = await app`SELECT * FROM events.resolve_qr(${qrHash(token)})`;
    const qrTok = randomBytes(32);
    await app`SELECT events.create_guest(${qr!.access_code_id}, 'qr', 'Quinn', ${qrTok})`;

    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.access_codes SET code_revoked_at = now() WHERE id = ${id}`);
    expect((await app`SELECT * FROM events.resolve_code(${`other-${run}`}, ${codeHmac('REVOKEME')})`).length).toBe(0);
    expect((await app`SELECT * FROM events.resolve_guest(${viaCode.token}, ${other})`).length).toBe(0);
    // The QR still works until it is revoked separately.
    expect((await app`SELECT * FROM events.resolve_guest(${qrTok}, ${other})`).length).toBe(1);
    expect((await app`SELECT * FROM events.resolve_qr(${qrHash(token)})`).length).toBe(1);
  });

  it('shows a published album only to its audience, and never hidden or unfinished uploads', async () => {
    const [ready] = await as({ userId: ids.cara }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.cara }, { status: 'ready' }))} RETURNING id`);
    await as({ userId: ids.cara }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.cara }, { status: 'ready', hidden: true }))}`);
    const visible = (ctx: Ctx) =>
      as(ctx, (tx) => tx`SELECT id, hidden, status FROM events.uploads WHERE event_id = ${shower}`).then((r) => r);

    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET status = 'published', audience = 'family' WHERE id = ${shower}`);
    const famView = await visible({ userId: ids.fay });
    expect(famView.length).toBeGreaterThan(0);
    expect(famView.every((u) => !u.hidden && u.status === 'ready')).toBe(true);
    expect(famView.some((u) => u.id === ready!.id)).toBe(true);
    expect((await visible({ userId: ids.otto })).length).toBe(0); // not in the family
    expect((await visible({})).length).toBe(0);

    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET audience = 'public' WHERE id = ${shower}`);
    const anon = await visible({});
    expect(anon.length).toBe(famView.length);

    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET audience = 'invitees' WHERE id = ${shower}`);
    expect((await visible({})).length).toBe(0);
    expect((await visible({ userId: ids.fay })).length).toBe(0);
  });

  it('keeps chat to members', async () => {
    await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.messages (event_id, user_id, body) VALUES (${shower}, ${ids.mia}, 'so fun!')`);
    expect((await as({ userId: ids.cara }, (tx) => tx`SELECT id FROM events.messages WHERE event_id = ${shower}`)).length).toBe(1);
    await expect(
      as({ userId: ids.otto }, (tx) => tx`INSERT INTO events.messages (event_id, user_id, body) VALUES (${shower}, ${ids.otto}, 'hi')`),
    ).rejects.toThrow(/row-level security/);
    // Posting as someone else is refused even for members.
    await expect(
      as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.messages (event_id, user_id, body) VALUES (${shower}, ${ids.cara}, 'hi')`),
    ).rejects.toThrow(/row-level security/);
    const g = await guestFor(`shower-${run}`, 'CB1106', 'Bea3');
    expect((await as({ guest: g }, (tx) => tx`SELECT id FROM events.messages`)).length).toBe(0);
  });

  it('records activity from anyone, but only managers can read it and nobody can change it', async () => {
    await as({}, (tx) => tx`SELECT events.log_activity(${tx.json({ event_id: shower, action: 'guest.code_failed', ip: '203.0.113.9', device_id: 'dev-1', detail: { tried: 'NOPE' } })})`);
    await as({}, (tx) => tx`SELECT events.log_activity(${tx.json({ event_id: shower, action: 'x', detail: { big: 'y'.repeat(20000) } })})`);
    const read = (ctx: Ctx) => as(ctx, (tx) => tx`SELECT action, detail FROM events.activity WHERE event_id = ${shower}`);
    const forOwner = await read({ userId: ids.cara });
    expect(forOwner.some((r) => r.action === 'guest.code_failed' && r.detail.tried === 'NOPE')).toBe(true);
    expect(forOwner.find((r) => r.action === 'x')!.detail).toEqual({}); // oversized detail trimmed, row kept
    expect((await read({ userId: ids.mia })).length).toBe(0); // invitee
    expect((await read({})).length).toBe(0);
    const g = await guestFor(`shower-${run}`, 'CB1106', 'Bea4');
    expect((await read({ guest: g })).length).toBe(0);
    await expect(as({ userId: ids.cara }, (tx) => tx`UPDATE events.activity SET ip = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(as({ userId: ids.cara }, (tx) => tx`DELETE FROM events.activity`)).rejects.toThrow(/permission denied/);
    await expect(
      as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.activity (event_id, action) VALUES (${shower}, 'forged')`),
    ).rejects.toThrow(/permission denied/);
  });

  it('lets album viewers comment as themselves; authors and managers remove comments', async () => {
    // A ready, visible upload in the shower album (published to the family by an earlier test? reset to invitees).
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET status = 'published', audience = 'invitees' WHERE id = ${shower}`);
    const [u] = await as({ userId: ids.cara }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.cara }, { status: 'ready' }))} RETURNING id`);
    const add = (ctx: Ctx, fields: Record<string, unknown>) =>
      as(ctx, (tx) => tx`INSERT INTO events.comments ${tx({ event_id: shower, upload_id: u!.id, author_name: 'x', body: 'hi', user_id: null, guest_id: null, ...fields })} RETURNING id`);

    const [mine] = await add({ userId: ids.mia }, { user_id: ids.mia });
    await expect(add({ userId: ids.mia }, { user_id: ids.cara })).rejects.toThrow(/row-level security/); // as someone else
    await expect(add({ userId: ids.otto }, { user_id: ids.otto })).rejects.toThrow(/row-level security/); // can't see album
    const viewer = await guestFor(`shower-${run}`, 'VIEW-ONLY', 'Val');
    await add({ guest: viewer }, { guest_id: viewer.id });
    const uploader = await guestFor(`shower-${run}`, 'CB1106', 'Una'); // upload-only code
    await expect(add({ guest: uploader }, { guest_id: uploader.id })).rejects.toThrow(/row-level security/);

    // Hidden uploads can't be commented on by viewers.
    const [hid] = await as({ userId: ids.cara }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.cara }, { status: 'ready', hidden: true }))} RETURNING id`);
    await expect(
      as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.comments (event_id, upload_id, user_id, author_name, body) VALUES (${shower}, ${hid!.id}, ${ids.mia}, 'm', 'x')`),
    ).rejects.toThrow(/row-level security/);

    // Someone else's comment can't be removed by an invitee; the owner can.
    const theirs = await as({ guest: viewer }, (tx) => tx`SELECT id FROM events.comments WHERE guest_id = ${viewer.id}`);
    expect((await as({ userId: ids.mia }, (tx) => tx`UPDATE events.comments SET deleted_at = now() WHERE id = ${theirs[0]!.id} RETURNING id`)).length).toBe(0);
    expect((await as({ userId: ids.mia }, (tx) => tx`UPDATE events.comments SET deleted_at = now() WHERE id = ${mine!.id} RETURNING id`)).length).toBe(1);
    expect((await as({ userId: ids.cara }, (tx) => tx`UPDATE events.comments SET deleted_at = now() WHERE id = ${theirs[0]!.id} RETURNING id`)).length).toBe(1);
    await expect(as({ userId: ids.cara }, (tx) => tx`DELETE FROM events.comments`)).rejects.toThrow(/permission denied/);
  });

  it('shows gift links to whoever sees the event; only owners edit them', async () => {
    await as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.links (event_id, kind, label, url) VALUES (${shower}, 'venmo', 'Venmo', 'https://venmo.com/u/cassie')`);
    await expect(
      as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.links (event_id, kind, label, url) VALUES (${shower}, 'link', 'x', 'https://evil.example')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.links (event_id, kind, label, url) VALUES (${shower}, 'link', 'x', 'javascript:alert(1)')`),
    ).rejects.toThrow(/check constraint/);
    expect((await as({ userId: ids.mia }, (tx) => tx`SELECT id FROM events.links WHERE event_id = ${shower}`)).length).toBe(1);
    expect((await as({ userId: ids.otto }, (tx) => tx`SELECT id FROM events.links WHERE event_id = ${shower}`)).length).toBe(0);
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET audience = 'public' WHERE id = ${shower}`);
    expect((await as({}, (tx) => tx`SELECT id FROM events.links WHERE event_id = ${shower}`)).length).toBe(1);
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET audience = 'invitees' WHERE id = ${shower}`);
  });

  it('lets only the uploader decorate their own photo', async () => {
    const [u] = await as({ userId: ids.mia }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }, { status: 'ready' }))} RETURNING id`);
    const setO = (ctx: Ctx) => as(ctx, (tx) => tx`SELECT events.set_overlay(${u!.id}, ${tx.json({ frame: 'hearts' })}, 'Cheers!') AS ok`).then((r) => r[0]!.ok);
    expect(await setO({ userId: ids.cara })).toBe(false); // not the uploader, even as owner
    expect(await setO({})).toBe(false);
    expect(await setO({ userId: ids.mia })).toBe(true);
    const [row] = await as({ userId: ids.mia }, (tx) => tx`SELECT overlay, caption FROM events.uploads WHERE id = ${u!.id}`);
    expect(row!.overlay).toEqual({ frame: 'hearts' });
    expect(row!.caption).toBe('Cheers!');
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.uploads SET hidden = true WHERE id = ${u!.id}`);
    expect(await setO({ userId: ids.mia })).toBe(false); // hidden by a manager: locked
  });

  it('shows nobody but the uploader and the hosts an upload until a host approves it', async () => {
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET status = 'published', audience = 'public' WHERE id = ${shower}`);
    await addCode(shower, 'BOTHWAYS', { upload: true, view: true });
    const gina = await guestFor(`shower-${run}`, 'BOTHWAYS', 'Gina');
    const vera = await guestFor(`shower-${run}`, 'BOTHWAYS', 'Vera');
    const sees = (ctx: Ctx, id: string) => as(ctx, (tx) => tx`SELECT id FROM events.uploads WHERE id = ${id}`).then((r) => r.length === 1);

    // A guest and an invitee upload; trying to self-approve on the way in doesn't stick.
    const [g] = await as({ guest: gina }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { guestId: gina.id }, { status: 'ready', approved_at: new Date() }))} RETURNING id, approved_at`);
    const [m] = await as({ userId: ids.mia }, (tx) =>
      tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }, { status: 'ready' }))} RETURNING id, approved_at`);
    expect(g!.approved_at).toBeNull();
    expect(m!.approved_at).toBeNull();

    for (const id of [g!.id, m!.id]) {
      expect(await sees({ userId: ids.cara }, id)).toBe(true); // host
      expect(await sees({ userId: ids.ada, admin: true }, id)).toBe(true); // admin
      expect(await sees({ guest: vera }, id)).toBe(false); // another guest at the same table
      expect(await sees({ userId: ids.fay }, id)).toBe(false); // family
      expect(await sees({}, id)).toBe(false); // the public page
    }
    expect(await sees({ guest: gina }, g!.id)).toBe(true); // her own
    expect(await sees({ guest: gina }, m!.id)).toBe(false);
    expect(await sees({ userId: ids.mia }, g!.id)).toBe(false); // an invitee doesn't see a guest's
    // Nor can anyone comment on what they can't see.
    await expect(
      as({ guest: vera }, (tx) => tx`INSERT INTO events.comments (event_id, upload_id, guest_id, author_name, body) VALUES (${shower}, ${g!.id}, ${vera.id}, 'v', 'x')`),
    ).rejects.toThrow(/row-level security/);

    // Uploaders can't approve themselves, even while their upload is still open to them.
    const [p] = await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }))} RETURNING id`);
    await expect(as({ userId: ids.mia }, (tx) => tx`UPDATE events.uploads SET approved_at = now() WHERE id = ${p!.id}`)).rejects.toThrow(/only hosts approve/);

    // While any upload link could still change it, not even a host can approve it.
    await owner`UPDATE events.uploads SET writable_until = now() + interval '5 minutes' WHERE id = ${g!.id}`;
    await expect(as({ userId: ids.cara }, (tx) => tx`UPDATE events.uploads SET approved_at = now() WHERE id = ${g!.id}`)).rejects.toThrow(/still be changed/);
    await owner`UPDATE events.uploads SET writable_until = now() - interval '1 minute' WHERE id = ${g!.id}`;

    // Before approval the uploader may still decorate; that keeps it unapprovable for a while.
    expect((await as({ guest: gina }, (tx) => tx`SELECT events.set_overlay(${g!.id}, ${tx.json({ frame: 'hearts' })}, 'Hi') AS ok`))[0]!.ok).toBe(true);
    await expect(as({ userId: ids.cara }, (tx) => tx`UPDATE events.uploads SET approved_at = now() WHERE id = ${g!.id}`)).rejects.toThrow(/still be changed/);
    await owner`UPDATE events.uploads SET writable_until = now() - interval '1 minute' WHERE id = ${g!.id}`;

    // A host approves: now everyone who can see the album sees it.
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.uploads SET approved_at = now(), approved_by = ${ids.cara} WHERE id = ${g!.id}`);
    expect(await sees({ guest: vera }, g!.id)).toBe(true);
    expect(await sees({}, g!.id)).toBe(true);
    expect(await sees({ userId: ids.fay }, g!.id)).toBe(true);
    expect(await sees({}, m!.id)).toBe(false); // the other one is still waiting

    // Once approved, the uploader can't change it any more (no swapping the picture or caption).
    expect((await as({ guest: gina }, (tx) => tx`SELECT events.set_overlay(${g!.id}, ${tx.json({ frame: 'polaroid' })}, 'Ha') AS ok`))[0]!.ok).toBe(false);
    // A host's own uploads need no review.
    const [h] = await as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.cara }, { status: 'ready' }))} RETURNING id`);
    expect(await sees({}, h!.id)).toBe(true);
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.events SET audience = 'invitees' WHERE id = ${shower}`);
  });

  it('keeps albums to hosts until published, and shows only approved photos through them', async () => {
    const ev = await createEvent(ids.cara!, `albums-${run}`);
    await as({ userId: ids.cara }, async (tx) => {
      await tx`INSERT INTO events.members (event_id, user_id, role) VALUES (${ev}, ${ids.mia}, 'invitee')`;
      await tx`UPDATE events.events SET status = 'published', audience = 'family' WHERE id = ${ev}`;
    });
    const [album] = await as({ userId: ids.cara }, (tx) =>
      tx`INSERT INTO events.albums (event_id, slug, title) VALUES (${ev}, 'ceremony', 'Ceremony') RETURNING id`);
    const albums = (ctx: Ctx) => as(ctx, (tx) => tx`SELECT id FROM events.albums WHERE event_id = ${ev}`).then((r) => r.length);
    expect(await albums({ userId: ids.cara })).toBe(1);
    expect(await albums({ userId: ids.mia })).toBe(0); // not published yet
    expect(await albums({ userId: ids.fay })).toBe(0);
    // Only co-hosts and editors make albums.
    await expect(as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.albums (event_id, slug, title) VALUES (${ev}, 'mine', 'Mine')`))
      .rejects.toThrow(/row-level security/);

    // A host's photo (approved as it arrives) and an invitee's (waiting) both go in.
    const [h] = await as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(ev, { userId: ids.cara }, { status: 'ready' }))} RETURNING id`);
    const [p] = await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(ev, { userId: ids.mia }, { status: 'ready' }))} RETURNING id`);
    await as({ userId: ids.cara }, (tx) => tx`
      INSERT INTO events.album_items (album_id, upload_id, event_id) VALUES (${album!.id}, ${h!.id}, ${ev}), (${album!.id}, ${p!.id}, ${ev})`);
    await expect(as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.album_items (album_id, upload_id, event_id) VALUES (${album!.id}, ${p!.id}, ${ev})`))
      .rejects.toThrow(/row-level security|duplicate key/);
    // A photo from another event can't be put in this event's album.
    const [x] = await as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(other, { userId: ids.cara }, { status: 'ready' }))} RETURNING id`);
    await expect(as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.album_items (album_id, upload_id, event_id) VALUES (${album!.id}, ${x!.id}, ${ev})`))
      .rejects.toThrow(/foreign key/);

    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.albums SET published_at = now() WHERE id = ${album!.id}`);
    expect(await albums({ userId: ids.mia })).toBe(1);
    expect(await albums({ userId: ids.fay })).toBe(1); // family audience
    expect(await albums({ userId: ids.otto })).toBe(0); // not family
    // What shows through an album is still up to the uploads policy.
    const photos = (ctx: Ctx) => as(ctx, (tx) => tx`
      SELECT u.id FROM events.album_items i JOIN events.uploads u ON u.id = i.upload_id WHERE i.album_id = ${album!.id}`).then((r) => r.map((x) => x.id).sort());
    expect(await photos({ userId: ids.cara })).toEqual([h!.id, p!.id].sort());
    expect(await photos({ userId: ids.mia })).toEqual([h!.id, p!.id].sort()); // her own, waiting
    expect(await photos({ userId: ids.fay })).toEqual([h!.id]); // the waiting one doesn't show
    // Nobody but a host takes photos out.
    await as({ userId: ids.mia }, (tx) => tx`DELETE FROM events.album_items WHERE album_id = ${album!.id}`);
    expect((await photos({ userId: ids.cara })).length).toBe(2);
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.albums SET published_at = NULL WHERE id = ${album!.id}`);
    expect(await albums({ userId: ids.fay })).toBe(0);
    expect((await photos({ userId: ids.fay })).length).toBe(0);
  });

  it('opens a public album to anyone, and only its approved photos', async () => {
    const ev = await createEvent(ids.cara!, `public-album-${run}`); // a private draft event
    const [pub, priv] = await as({ userId: ids.cara }, (tx) => tx`
      INSERT INTO events.albums (event_id, slug, title, audience, published_at)
      VALUES (${ev}, 'dance', 'First dance', 'public', now()), (${ev}, 'family', 'Family', 'private', now()) RETURNING id`);
    const add = async (opts: Record<string, unknown> = {}) => {
      const [u] = await as({ userId: ids.cara }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(ev, { userId: ids.cara }, { status: 'ready', ...opts }))} RETURNING id`);
      return u!.id as string;
    };
    const shown = await add();
    const hidden = await add({ hidden: true });
    const elsewhere = await add(); // approved, but in no public album
    const [waiting] = await as({ userId: ids.mia }, async (tx) => {
      await owner`INSERT INTO events.members (event_id, user_id, role) VALUES (${ev}, ${ids.mia}, 'invitee')`;
      return tx`INSERT INTO events.uploads ${tx(upload(ev, { userId: ids.mia }, { status: 'ready' }))} RETURNING id`;
    });
    await as({ userId: ids.cara }, (tx) => tx`
      INSERT INTO events.album_items (album_id, upload_id, event_id)
      VALUES (${pub!.id}, ${shown}, ${ev}), (${pub!.id}, ${hidden}, ${ev}), (${pub!.id}, ${waiting!.id}, ${ev}), (${priv!.id}, ${elsewhere}, ${ev})`);

    for (const stranger of [{}, { userId: ids.otto }] as Ctx[]) {
      const albums = await as(stranger, (tx) => tx`SELECT id FROM events.albums WHERE event_id = ${ev}`);
      expect(albums.map((a) => a.id)).toEqual([pub!.id]); // the public one, not the private one
      const inside = await as(stranger, (tx) => tx`
        SELECT u.id FROM events.album_items i JOIN events.uploads u ON u.id = i.upload_id WHERE i.album_id = ${pub!.id}`);
      expect(inside.map((r) => r.id)).toEqual([shown]); // not the hidden one, not the waiting one
      expect((await as(stranger, (tx) => tx`SELECT id FROM events.uploads WHERE event_id = ${ev}`)).map((r) => r.id)).toEqual([shown]);
      expect((await as(stranger, (tx) => tx`SELECT id FROM events.events WHERE id = ${ev}`)).length).toBe(0); // the event stays private
      expect((await as(stranger, (tx) => tx`SELECT id FROM events.comments WHERE event_id = ${ev}`)).length).toBe(0);
    }
    // Unpublished or made private again: gone for strangers.
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.albums SET audience = 'private' WHERE id = ${pub!.id}`);
    expect((await as({}, (tx) => tx`SELECT id FROM events.uploads WHERE event_id = ${ev}`)).length).toBe(0);
    await as({ userId: ids.cara }, (tx) => tx`UPDATE events.albums SET audience = 'public', published_at = NULL WHERE id = ${pub!.id}`);
    expect((await as({}, (tx) => tx`SELECT id FROM events.albums WHERE event_id = ${ev}`)).length).toBe(0);
    // Only hosts choose who sees an album.
    await as({ userId: ids.mia }, (tx) => tx`UPDATE events.albums SET published_at = now() WHERE id = ${pub!.id}`);
    expect((await as({}, (tx) => tx`SELECT id FROM events.albums WHERE event_id = ${ev}`)).length).toBe(0);
  });

  it('cleans up only unfinished uploads past the grace period', async () => {
    const [stale] = await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }))} RETURNING id`);
    const [fresh] = await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }))} RETURNING id`);
    const [doneOld] = await as({ userId: ids.mia }, (tx) => tx`INSERT INTO events.uploads ${tx(upload(shower, { userId: ids.mia }, { status: 'ready' }))} RETURNING id`);
    await owner`UPDATE events.uploads SET created_at = now() - interval '3 days' WHERE id IN (${stale!.id}, ${doneOld!.id})`;
    const claimed = await app`SELECT * FROM events.claim_stale_uploads('48 hours'::interval, 1000)`;
    const ids2 = claimed.map((r) => r.id);
    expect(ids2).toContain(stale!.id);
    expect(ids2).not.toContain(fresh!.id);
    expect(ids2).not.toContain(doneOld!.id);
  });

  it('never lets the app role read access codes or guests anonymously', async () => {
    expect((await as({}, (tx) => tx`SELECT id FROM events.access_codes`)).length).toBe(0);
    expect((await as({}, (tx) => tx`SELECT id FROM events.guests`)).length).toBe(0);
    await expect(app`INSERT INTO events.guests (event_id, access_code_id, via, display_name, token_hash)
                     SELECT ${shower}, id, 'code', 'x', ${randomBytes(32)} FROM events.access_codes LIMIT 1`).rejects.toThrow(/permission denied/);
  });
});
