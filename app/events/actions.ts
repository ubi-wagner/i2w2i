'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { audit } from '@/lib/audit';
import { canIssueLink, normalizeEmail, type PlatformRole } from '@/lib/access';
import { issueLink } from '@/lib/auth/links';
import { sql } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/events/activity';
import { withCtx, type Tx } from '@/lib/events/db';
import { userCtx } from '@/lib/events/session';
import { codeHmac, encryptCode, normalizeCode, qrHash, qrToken } from '@/lib/events/codes';
import { isValidSlug, slugify } from '@/lib/events/rules';
import { isTheme } from '@/lib/events/themes';
import { cleanPage } from '@/lib/events/page';
import { eventInviteUrl } from '@/lib/events/qr';
import { defaultLabel, LINK_KINDS, linkUrl, type LinkKind } from '@/lib/events/links';
import { deleteObject } from '@/lib/storage';

// Every action re-derives the requester and runs inside withCtx, so the
// row-level security in db/migrations/003 decides what actually changes.

export interface FormState {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

async function ctx() {
  const { user } = await requireApp('events');
  return { user, ctx: userCtx(user) };
}

function str(form: FormData, key: string, max = 2000): string {
  return String(form.get(key) ?? '').trim().slice(0, max);
}

function isRlsError(err: unknown): boolean {
  return /row-level security|permission denied/i.test(String((err as Error)?.message));
}

export async function createEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, ctx: c } = await ctx();
  const title = str(form, 'title', 120);
  const slug = str(form, 'slug', 61) || slugify(title);
  const fields = { title, slug, starts_on: str(form, 'starts_on'), location: str(form, 'location', 200), description: str(form, 'description') };
  if (!title) return { error: 'Give the event a name.', fields };
  if (!isValidSlug(slug)) return { error: 'The web address can use lowercase letters, numbers and dashes.', fields };
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(fields.starts_on) ? fields.starts_on : null;

  let id: string;
  try {
    id = await withCtx(c, async (tx) => {
      const [e] = await tx<{ id: string }[]>`
        INSERT INTO events.events (slug, title, starts_on, location, description, created_by)
        VALUES (${slug}, ${title}, ${startsOn}, ${fields.location}, ${fields.description}, ${user.id})
        RETURNING id`;
      await tx`INSERT INTO events.members (event_id, user_id, role, added_by) VALUES (${e!.id}, ${user.id}, 'owner', ${user.id})`;
      return e!.id;
    });
  } catch (err) {
    if (/duplicate key/.test(String((err as Error).message))) return { error: 'That web address is taken. Try another.', fields };
    if (isRlsError(err)) return { error: 'Your account can’t create events. Ask the family admin.', fields };
    throw err;
  }
  await audit(user.id, 'events.create', id, { slug });
  redirect(`/events/${id}`);
}

/** Publishing: who sees the album, and whether there's a group chat. */
export async function updateEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const status = form.get('status') === 'published' ? 'published' : 'draft';
  const audience = ['public', 'family', 'invitees'].includes(str(form, 'audience')) ? str(form, 'audience') : 'invitees';
  const rows = await withCtx(c, (tx) => tx`
    UPDATE events.events
       SET status = ${status}, audience = ${audience}, chat_enabled = ${form.get('chat_enabled') === 'on'},
           published_at = CASE WHEN ${status} = 'published' THEN coalesce(published_at, now()) ELSE published_at END
     WHERE id = ${id}
    RETURNING id`);
  if (!rows.length) return { error: 'Only the event’s hosts and helpers can change it.' };
  await audit(user.id, 'events.update', id, { status, audience });
  revalidatePath(`/events/${id}`);
  revalidatePath('/album/[slug]', 'page');
  return { message: status === 'published' ? 'Saved. The album is published.' : 'Saved.' };
}

export interface PageInput {
  eventId: string;
  title: string;
  startsOn: string;
  location: string;
  description: string;
  theme: string;
  giftNote: string;
  page: unknown;
}

/** Everything guests see on the event's pages, saved together from the page editor. */
export async function updatePage(input: PageInput): Promise<FormState> {
  const { user, ctx: c } = await ctx();
  const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const id = clip(input?.eventId, 40);
  const title = clip(input?.title, 120);
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: 'Something went wrong. Reload and try again.' };
  if (!title) return { error: 'The event needs a name.' };
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(clip(input.startsOn, 10)) ? clip(input.startsOn, 10) : null;
  const theme = isTheme(input.theme) ? input.theme : 'classic';
  const page = cleanPage(input.page);
  const rows = await withCtx(c, (tx) => tx`
    UPDATE events.events
       SET title = ${title}, starts_on = ${startsOn}, location = ${clip(input.location, 200)},
           description = ${clip(input.description, 2000)}, theme = ${theme}, gift_note = ${clip(input.giftNote, 500)},
           page = ${tx.json(page as unknown as Parameters<typeof tx.json>[0])}
     WHERE id = ${id}
    RETURNING id`);
  if (!rows.length) return { error: 'Only the event’s hosts and helpers can change its page.' };
  await audit(user.id, 'events.page', id, { theme });
  revalidatePath(`/events/${id}`);
  revalidatePath('/album/[slug]', 'page');
  return { message: 'Saved. Guests see it now.' };
}

export async function addMember(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const userId = str(form, 'user_id');
  const role = ['owner', 'curator', 'invitee'].includes(str(form, 'role')) ? str(form, 'role') : 'invitee';
  if (!userId) return;
  if (userId === user.id && role !== 'owner') return; // don't demote yourself out of managing
  await withCtx(c, (tx) => tx`
    INSERT INTO events.members (event_id, user_id, role, added_by) VALUES (${id}, ${userId}, ${role}, ${user.id})
    ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`);
  await audit(user.id, 'events.member.add', id, { user: userId, role });
  revalidatePath(`/events/${id}`);
}

export async function removeMember(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const userId = str(form, 'user_id');
  if (userId === user.id) return; // don't lock yourself out
  await withCtx(c, (tx) => tx`DELETE FROM events.members WHERE event_id = ${id} AND user_id = ${userId}`);
  await audit(user.id, 'events.member.remove', id, { user: userId });
  revalidatePath(`/events/${id}`);
}

export async function createAccessCode(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const label = str(form, 'label', 80);
  const typed = str(form, 'code', 40);
  const canUpload = form.get('can_upload') === 'on';
  const canView = form.get('can_view') === 'on';
  const fields = { label, code: typed };
  const code = typed ? normalizeCode(typed) : null;
  if (typed && !code) return { error: 'Codes are 4–20 letters and numbers.', fields };
  if (!canUpload && !canView) return { error: 'A code has to allow adding photos, viewing, or both.', fields };

  const codeId = randomUUID();
  try {
    const rows = await withCtx(c, (tx) => tx`
      INSERT INTO events.access_codes (id, event_id, label, code_hmac, code_enc, qr_hash, can_upload, can_view, created_by)
      VALUES (${codeId}, ${id}, ${label}, ${code ? codeHmac(code) : null}, ${code ? encryptCode(code) : null},
              ${qrHash(qrToken(codeId, 1))}, ${canUpload}, ${canView}, ${user.id})
      RETURNING id`);
    if (!rows.length) return { error: 'Only owners can create codes.', fields };
  } catch (err) {
    if (/duplicate key/.test(String((err as Error).message))) return { error: 'This event already has that code.', fields };
    if (isRlsError(err)) return { error: 'Only owners can create codes.', fields };
    throw err;
  }
  await audit(user.id, 'events.code.create', id, { code_id: codeId, canUpload, canView });
  revalidatePath(`/events/${id}`);
  return { message: 'Code created.' };
}

export async function changeAccessCode(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const codeId = str(form, 'code_id');
  const action = str(form, 'action');
  await withCtx(c, async (tx) => {
    if (action === 'revoke_code') await tx`UPDATE events.access_codes SET code_revoked_at = now() WHERE id = ${codeId}`;
    if (action === 'restore_code') await tx`UPDATE events.access_codes SET code_revoked_at = NULL WHERE id = ${codeId}`;
    if (action === 'revoke_qr') await tx`UPDATE events.access_codes SET qr_revoked_at = now() WHERE id = ${codeId}`;
    if (action === 'reissue_qr') {
      const [row] = await tx<{ qr_version: number }[]>`SELECT qr_version FROM events.access_codes WHERE id = ${codeId}`;
      if (!row) return;
      const v = row.qr_version + 1;
      await tx`UPDATE events.access_codes SET qr_version = ${v}, qr_hash = ${qrHash(qrToken(codeId, v))}, qr_revoked_at = NULL WHERE id = ${codeId}`;
    }
  });
  await audit(user.id, `events.code.${action}`, id, { code_id: codeId });
  await logActivity({ eventId: id, action: `code.${action}`, userId: user.id, actorName: user.display_name, detail: { code_id: codeId } });
  revalidatePath(`/events/${id}`);
}

export async function moderateUpload(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const uploadId = str(form, 'upload_id');
  const action = str(form, 'action');
  const removed = await withCtx(c, async (tx) => {
    if (action === 'hide') await tx`UPDATE events.uploads SET hidden = true WHERE id = ${uploadId}`;
    if (action === 'show') await tx`UPDATE events.uploads SET hidden = false WHERE id = ${uploadId}`;
    if (action === 'feature') await tx`UPDATE events.uploads SET featured = true WHERE id = ${uploadId}`;
    if (action === 'unfeature') await tx`UPDATE events.uploads SET featured = false WHERE id = ${uploadId}`;
    if (action === 'approve') await tx`UPDATE events.uploads SET approved_at = now(), approved_by = ${user.id} WHERE id = ${uploadId} AND ${approvable(tx)}`;
    if (action === 'delete') {
      return tx<{ original_key: string; preview_key: string | null }[]>`
        DELETE FROM events.uploads WHERE id = ${uploadId} RETURNING original_key, preview_key`;
    }
    return [];
  });
  for (const r of removed) {
    await deleteObject(r.original_key).catch(() => {});
    if (r.preview_key) await deleteObject(r.preview_key).catch(() => {});
  }
  revalidatePath('/album/[slug]', 'page');
  await audit(user.id, `events.upload.${action}`, id, { upload: uploadId });
  await logActivity({ eventId: id, action: `upload.${action}`, userId: user.id, uploadId, actorName: user.display_name });
  revalidatePath(`/events/${id}`);
}

/** Ends a guest's access (their session stops working) and optionally hides everything they shared. */
export async function removeGuest(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const guestId = str(form, 'guest_id');
  const hide = form.get('hide_uploads') === 'on';
  await withCtx(c, async (tx) => {
    await tx`UPDATE events.guests SET revoked_at = now() WHERE id = ${guestId} AND event_id = ${id}`;
    if (hide) await tx`UPDATE events.uploads SET hidden = true WHERE uploader_guest_id = ${guestId} AND event_id = ${id}`;
  });
  await audit(user.id, 'events.guest.remove', id, { guest: guestId, hide });
  await logActivity({ eventId: id, action: 'guest.removed', userId: user.id, guestId, actorName: user.display_name, detail: { hide_uploads: hide } });
  revalidatePath(`/events/${id}`);
}

/**
 * Finished, not yet approved, and no upload link left that could change it
 * (the database refuses anything else; see migration 008).
 */
function approvable(tx: Tx) {
  return tx`status = 'ready' AND approved_at IS NULL AND (writable_until IS NULL OR writable_until < now())`;
}

/** Approves everything in the review queue that can be approved now (hosts looked at the grid first). */
export async function approveAllReady(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const rows = await withCtx(c, (tx) => tx<{ id: string }[]>`
    UPDATE events.uploads SET approved_at = now(), approved_by = ${user.id}
     WHERE event_id = ${id} AND NOT hidden AND ${approvable(tx)}
    RETURNING id`);
  await audit(user.id, 'events.upload.approve_all', id, { count: rows.length });
  await logActivity({ eventId: id, action: 'upload.bulk_approve', userId: user.id, actorName: user.display_name, detail: { count: rows.length, ids: rows.map((r) => r.id) } });
  revalidatePath(`/events/${id}`);
  revalidatePath('/album/[slug]', 'page');
}

/** Bulk moderation of selected uploads: approve, hide, show, feature, unfeature or delete. */
export async function moderateUploads(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const action = str(form, 'action');
  const ids = form.getAll('upload_id').map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)).slice(0, 1000);
  if (!ids.length || !['approve', 'hide', 'show', 'feature', 'unfeature', 'delete'].includes(action)) return;
  const removed = await withCtx(c, async (tx) => {
    const where = tx`event_id = ${id} AND id = ANY(${ids}::uuid[])`;
    if (action === 'hide') await tx`UPDATE events.uploads SET hidden = true WHERE ${where}`;
    if (action === 'show') await tx`UPDATE events.uploads SET hidden = false WHERE ${where}`;
    if (action === 'feature') await tx`UPDATE events.uploads SET featured = true WHERE ${where}`;
    if (action === 'unfeature') await tx`UPDATE events.uploads SET featured = false WHERE ${where}`;
    if (action === 'approve') await tx`UPDATE events.uploads SET approved_at = now(), approved_by = ${user.id} WHERE ${where} AND ${approvable(tx)}`;
    if (action === 'delete') {
      return tx<{ id: string; original_key: string; preview_key: string | null }[]>`
        DELETE FROM events.uploads WHERE ${where} RETURNING id, original_key, preview_key`;
    }
    return [];
  });
  for (const r of removed) {
    await deleteObject(r.original_key).catch(() => {});
    if (r.preview_key) await deleteObject(r.preview_key).catch(() => {});
  }
  revalidatePath('/album/[slug]', 'page');
  await audit(user.id, `events.upload.bulk_${action}`, id, { count: ids.length });
  await logActivity({ eventId: id, action: `upload.bulk_${action}`, userId: user.id, actorName: user.display_name, detail: { count: ids.length, ids } });
  revalidatePath(`/events/${id}`);
}

export async function addLink(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const kind = str(form, 'kind') as LinkKind;
  const fields = { kind, value: str(form, 'value', 500), label: str(form, 'label', 80) };
  if (!LINK_KINDS.some((k) => k.kind === kind)) return { error: 'Pick a kind of link.', fields };
  const url = linkUrl(kind, fields.value);
  if (!url) return { error: 'That doesn’t look like a handle or an https:// link.', fields };
  const label = fields.label || defaultLabel(kind, url);
  try {
    await withCtx(c, (tx) => tx`INSERT INTO events.links (event_id, kind, label, url) VALUES (${id}, ${kind}, ${label}, ${url})`);
  } catch (err) {
    if (isRlsError(err)) return { error: 'Only owners can add links.', fields };
    throw err;
  }
  await audit(user.id, 'events.link.add', id, { kind, url });
  await logActivity({ eventId: id, action: 'link.add', userId: user.id, actorName: user.display_name, detail: { kind, url } });
  revalidatePath(`/events/${id}`);
  return { message: 'Added.' };
}

export async function removeLink(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const linkId = str(form, 'link_id');
  await withCtx(c, (tx) => tx`DELETE FROM events.links WHERE id = ${linkId} AND event_id = ${id}`);
  await audit(user.id, 'events.link.remove', id, { link: linkId });
  revalidatePath(`/events/${id}`);
}

export interface LinkState {
  error?: string;
  message?: string;
  link?: string;
  name?: string;
  fields?: Record<string, string>;
}

/**
 * Hosts invite people straight onto their event. New people get a family
 * member account (never more) created by this host, added to the event, and
 * a one-time link to share. People who already have an account are just
 * added; a host can only hand out sign-in links for accounts they invited.
 */
export async function inviteToEvent(_prev: LinkState, form: FormData): Promise<LinkState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const name = str(form, 'display_name', 80);
  const typed = str(form, 'email', 254);
  const asked = str(form, 'role');
  const role = asked === 'owner' || asked === 'curator' ? asked : 'invitee';
  const fields = { display_name: name, email: typed, role };
  const email = normalizeEmail(typed);
  if (!email) return { error: 'Enter a valid email address (it’s their username).', fields };
  if (!name) return { error: 'Enter their name.', fields };
  if (!rateLimit(`host-invite:${user.id}`, 60, 60 * 60_000)) return { error: 'That’s a lot of invites at once. Try again later.', fields };

  const [own] = await withCtx(c, (tx) => tx<{ ok: boolean }[]>`SELECT events.can_own(${id}) AS ok`);
  if (!own?.ok) return { error: 'Only the event’s owners can invite people.', fields };

  const [existing] = await sql<{ id: string; display_name: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean }[]>`
    SELECT id, display_name, platform_role, created_by, is_active FROM core.users WHERE email = ${email}`;
  let target = existing;
  if (!target) {
    target = await sql.begin(async (tx) => {
      const [u] = await tx<{ id: string; display_name: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean }[]>`
        INSERT INTO core.users (email, display_name, platform_role, created_by)
        VALUES (${email}, ${name}, 'member', ${user.id})
        RETURNING id, display_name, platform_role, created_by, is_active`;
      await tx`INSERT INTO core.family_members (family_id, user_id) SELECT id, ${u!.id} FROM core.families`;
      await tx`INSERT INTO core.user_app_roles (user_id, app_key, role, granted_by) VALUES (${u!.id}, 'events', 'viewer', ${user.id})`;
      return u!;
    });
    await audit(user.id, 'people.invite.by_host', target.id, { email, event: id });
  } else if (!target.is_active) {
    return { error: 'That account is deactivated. Ask Eric to turn it back on.', fields };
  }

  await withCtx(c, (tx) => tx`
    INSERT INTO events.members (event_id, user_id, role, added_by) VALUES (${id}, ${target.id}, ${role}, ${user.id})
    ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`);
  // Make sure they can open the Events app at all.
  await sql`INSERT INTO core.user_app_roles (user_id, app_key, role, granted_by) VALUES (${target.id}, 'events', 'viewer', ${user.id})
            ON CONFLICT (user_id, app_key) DO NOTHING`;
  await logActivity({ eventId: id, action: 'member.invite', userId: user.id, actorName: user.display_name, detail: { invited: target.id, role, new_account: !existing } });
  revalidatePath(`/events/${id}`);

  if (existing && !canIssueLink(user, target)) {
    return { message: `${target.display_name} already has an account and is now on this event. They’ll see it under Events when they sign in.` };
  }
  const [ev] = await withCtx(c, (tx) => tx<{ slug: string }[]>`SELECT slug FROM events.events WHERE id = ${id}`);
  const link = await issueLink(target.id, 'invite');
  return { link: ev ? eventInviteUrl(link, ev.slug) : link, name: target.display_name };
}

/** A fresh one-time sign-in link (also the way to reset a forgotten password). */
export async function issueSignInLink(_prev: LinkState, form: FormData): Promise<LinkState> {
  const { user, ctx: c } = await ctx();
  const userId = str(form, 'user_id');
  const [target] = await sql<{ id: string; display_name: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean }[]>`
    SELECT id, display_name, platform_role, created_by, is_active FROM core.users WHERE id = ${userId}`;
  if (!target || !canIssueLink(user, target)) return { error: 'Only Eric can make a sign-in link for this person.' };
  await audit(user.id, 'people.link.issued', target.id);
  const link = await issueLink(target.id, 'invite');
  // From an event's page: the link opens that event's welcome page.
  const eventId = str(form, 'event_id');
  if (/^[0-9a-f-]{36}$/.test(eventId)) {
    const [ev] = await withCtx(c, (tx) => tx<{ slug: string }[]>`SELECT slug FROM events.events WHERE id = ${eventId}`);
    if (ev) return { link: eventInviteUrl(link, ev.slug), name: target.display_name };
  }
  return { link, name: target.display_name };
}
