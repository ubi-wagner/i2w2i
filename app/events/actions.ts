'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { audit } from '@/lib/audit';
import { createAccount, resetPassword, type Credentials } from '@/lib/auth/accounts';
import { appUrl } from '@/lib/auth/links';
import { sql } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/events/activity';
import { withCtx, type Tx } from '@/lib/events/db';
import { userCtx } from '@/lib/events/session';
import { codeHmac, encryptCode, normalizeCode, qrHash, qrToken } from '@/lib/events/codes';
import { isValidSlug, slugify } from '@/lib/events/rules';
import { isTheme } from '@/lib/events/themes';
import { cleanPage } from '@/lib/events/page';
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
  if (!rows.length) return { error: 'Only the event’s co-hosts and editors can change it.' };
  await audit(user.id, 'events.update', id, { status, audience });
  revalidatePath(`/events/${id}`, 'layout');
  revalidatePath('/album/[slug]', 'page');
  // The form resets after the action; these keep it showing what was saved.
  const fields = { status, audience, chat_enabled: form.get('chat_enabled') === 'on' ? 'on' : '' };
  return { message: status === 'published' ? 'Saved. The album is published.' : 'Saved. The album is a draft.', fields };
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
  if (!rows.length) return { error: 'Only the event’s co-hosts and editors can change its page.' };
  await audit(user.id, 'events.page', id, { theme });
  revalidatePath(`/events/${id}`, 'layout');
  revalidatePath('/album/[slug]', 'page');
  return { message: 'Saved. Guests see it now.' };
}

const ROLES = ['owner', 'curator', 'invitee'] as const;
type Role = (typeof ROLES)[number];
const ROLE_NAME: Record<Role, string> = { owner: 'a co-host', curator: 'an editor', invitee: 'a viewer' };
const roleOf = (form: FormData): Role => (ROLES as readonly string[]).includes(str(form, 'role')) ? (str(form, 'role') as Role) : 'invitee';

export interface MemberState { error?: string; message?: string; role?: string }

/** Thrown inside a transaction to undo a change that would leave the event without a co-host. */
class NoCoHostLeft extends Error {}
async function keepACoHost(tx: Tx, id: string) {
  const [o] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM events.members WHERE event_id = ${id} AND role = 'owner'`;
  if (!o?.n) throw new NoCoHostLeft();
}

/** Someone who already has an account joins the event. */
export async function addExistingMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const userId = str(form, 'user_id');
  const role = roleOf(form);
  if (!userId) return { error: 'Pick someone from the list.' };
  let name: string | undefined;
  try {
    name = await withCtx(c, async (tx) => {
      const added = await tx`INSERT INTO events.members (event_id, user_id, role, added_by) VALUES (${id}, ${userId}, ${role}, ${user.id})
                             ON CONFLICT (event_id, user_id) DO NOTHING RETURNING 1`;
      if (!added.length) return undefined;
      const [u] = await tx<{ display_name: string }[]>`SELECT display_name FROM core.users WHERE id = ${userId}`;
      return u?.display_name ?? 'They';
    });
  } catch (err) {
    if (isRlsError(err)) return { error: 'Only the event’s co-hosts can add people.' };
    throw err;
  }
  if (!name) return { error: 'They’re already on this event: change their role in the list above.' };
  await audit(user.id, 'events.member.add', id, { user: userId, role });
  await logActivity({ eventId: id, action: 'member.add', userId: user.id, actorName: user.display_name, detail: { added: userId, role } });
  revalidatePath(`/events/${id}`, 'layout');
  return { message: `Added ${name} as ${ROLE_NAME[role]}.` };
}

/** A different role for someone on the event. Every event keeps at least one co-host. */
export async function setMemberRole(prev: MemberState, form: FormData): Promise<MemberState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const userId = str(form, 'user_id');
  const role = roleOf(form);
  if (userId === user.id) return { error: 'You can’t change your own role. Ask another co-host.', role: prev.role };
  try {
    const changed = await withCtx(c, async (tx) => {
      const rows = await tx`UPDATE events.members SET role = ${role} WHERE event_id = ${id} AND user_id = ${userId} RETURNING 1`;
      if (rows.length) await keepACoHost(tx, id);
      return rows.length > 0;
    });
    if (!changed) return { error: 'Only the event’s co-hosts can change roles.', role: prev.role };
  } catch (err) {
    if (err instanceof NoCoHostLeft) return { error: 'Every event needs at least one co-host.', role: prev.role };
    throw err;
  }
  await audit(user.id, 'events.member.role', id, { user: userId, role });
  await logActivity({ eventId: id, action: 'member.role', userId: user.id, actorName: user.display_name, detail: { member: userId, role } });
  revalidatePath(`/events/${id}`, 'layout');
  return { message: `Saved: now ${ROLE_NAME[role]}.`, role };
}

/** Off the event (their account stays). Not yourself, and never the last co-host. */
export async function removeMember(_prev: MemberState, form: FormData): Promise<MemberState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const userId = str(form, 'user_id');
  if (userId === user.id) return { error: 'You can’t remove yourself. Ask another co-host.' };
  try {
    const gone = await withCtx(c, async (tx) => {
      const rows = await tx`DELETE FROM events.members WHERE event_id = ${id} AND user_id = ${userId} RETURNING 1`;
      if (rows.length) await keepACoHost(tx, id);
      return rows.length > 0;
    });
    if (!gone) return { error: 'Only the event’s co-hosts can remove people.' };
  } catch (err) {
    if (err instanceof NoCoHostLeft) return { error: 'Every event needs at least one co-host.' };
    throw err;
  }
  await audit(user.id, 'events.member.remove', id, { user: userId });
  await logActivity({ eventId: id, action: 'member.remove', userId: user.id, actorName: user.display_name, detail: { removed: userId } });
  revalidatePath(`/events/${id}`, 'layout');
  return { message: 'Removed.' };
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
  revalidatePath(`/events/${id}`, 'layout');
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
  revalidatePath(`/events/${id}`, 'layout');
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
  revalidatePath(`/events/${id}`, 'layout');
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
  revalidatePath(`/events/${id}`, 'layout');
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
  revalidatePath(`/events/${id}`, 'layout');
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
  revalidatePath(`/events/${id}`, 'layout');
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
  revalidatePath(`/events/${id}`, 'layout');
  return { message: 'Added.' };
}

export async function removeLink(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const linkId = str(form, 'link_id');
  await withCtx(c, (tx) => tx`DELETE FROM events.links WHERE id = ${linkId} AND event_id = ${id}`);
  await audit(user.id, 'events.link.remove', id, { link: linkId });
  revalidatePath(`/events/${id}`, 'layout');
}

export interface PeopleState {
  error?: string;
  /** For the host to pass on (text, or read out). */
  credentials?: Credentials;
  url?: string;
}

/**
 * Hosts add new people straight onto their event: a family-member account
 * (never more) made by this host, with the username and starting password
 * the host chose, to pass on themselves. People who already have an account
 * are added with the form below the list (addMember) instead.
 */
export async function inviteToEvent(_prev: PeopleState, form: FormData): Promise<PeopleState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const asked = str(form, 'role');
  const role = asked === 'owner' || asked === 'curator' ? asked : 'invitee';
  if (!rateLimit(`host-invite:${user.id}`, 60, 60 * 60_000)) return { error: 'That’s a lot of new people at once. Try again later.' };
  const [own] = await withCtx(c, (tx) => tx<{ ok: boolean }[]>`SELECT events.can_own(${id}) AS ok`);
  if (!own?.ok) return { error: 'Only the event’s co-hosts can add people.' };

  const made = await createAccount({
    name: str(form, 'display_name', 80),
    username: str(form, 'username', 64),
    password: String(form.get('password') ?? ''),
    platformRole: 'member',
    createdBy: user.id,
  });
  if ('error' in made) return { error: made.error };
  await audit(user.id, 'people.invite.by_host', made.id, { username: made.credentials.username, event: id });
  await withCtx(c, (tx) => tx`
    INSERT INTO events.members (event_id, user_id, role, added_by) VALUES (${id}, ${made.id}, ${role}, ${user.id})`);
  await logActivity({ eventId: id, action: 'member.invite', userId: user.id, actorName: user.display_name, detail: { invited: made.id, role, new_account: true } });
  revalidatePath(`/events/${id}`, 'layout');
  // Signing in from the message lands them in this album.
  const [ev] = await withCtx(c, (tx) => tx<{ slug: string }[]>`SELECT slug FROM events.events WHERE id = ${id}`);
  return { credentials: made.credentials, url: ev ? `${appUrl()}/login?next=/album/${ev.slug}` : appUrl() };
}

/** A new password for someone who forgot theirs: anyone for the admin, people they added for a host. */
export async function resetMemberPassword(_prev: PeopleState, form: FormData): Promise<PeopleState> {
  const { user } = await ctx();
  const userId = str(form, 'user_id');
  const done = await resetPassword(user, userId);
  if ('error' in done) return { error: done.error };
  await audit(user.id, 'people.password.reset', userId);
  return { credentials: done, url: appUrl() };
}
