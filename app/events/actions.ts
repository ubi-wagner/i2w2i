'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireApp } from '@/lib/apps';
import { audit } from '@/lib/audit';
import { logActivity } from '@/lib/events/activity';
import { withCtx } from '@/lib/events/db';
import { userCtx } from '@/lib/events/session';
import { codeHmac, encryptCode, normalizeCode, qrHash, qrToken } from '@/lib/events/codes';
import { isValidSlug, slugify } from '@/lib/events/rules';
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

export async function updateEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const title = str(form, 'title', 120);
  if (!title) return { error: 'The event needs a name.' };
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(str(form, 'starts_on')) ? str(form, 'starts_on') : null;
  const status = form.get('status') === 'published' ? 'published' : 'draft';
  const audience = ['public', 'family', 'invitees'].includes(str(form, 'audience')) ? str(form, 'audience') : 'invitees';
  const rows = await withCtx(c, (tx) => tx`
    UPDATE events.events
       SET title = ${title}, starts_on = ${startsOn}, location = ${str(form, 'location', 200)},
           description = ${str(form, 'description')}, status = ${status}, audience = ${audience},
           chat_enabled = ${form.get('chat_enabled') === 'on'},
           published_at = CASE WHEN ${status} = 'published' THEN coalesce(published_at, now()) ELSE published_at END
     WHERE id = ${id}
    RETURNING id`);
  if (!rows.length) return { error: 'Only the event’s owners and curators can change it.' };
  await audit(user.id, 'events.update', id, { status, audience });
  revalidatePath(`/events/${id}`);
  return { message: status === 'published' ? 'Saved. The album is published.' : 'Saved.' };
}

export async function addMember(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const userId = str(form, 'user_id');
  const role = ['owner', 'curator', 'invitee'].includes(str(form, 'role')) ? str(form, 'role') : 'invitee';
  if (!userId) return;
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

/** Bulk moderation of selected uploads: hide, show, feature, unfeature or delete. */
export async function moderateUploads(form: FormData): Promise<void> {
  const { user, ctx: c } = await ctx();
  const id = str(form, 'event_id');
  const action = str(form, 'action');
  const ids = form.getAll('upload_id').map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)).slice(0, 1000);
  if (!ids.length || !['hide', 'show', 'feature', 'unfeature', 'delete'].includes(action)) return;
  const removed = await withCtx(c, async (tx) => {
    const where = tx`event_id = ${id} AND id = ANY(${ids}::uuid[])`;
    if (action === 'hide') await tx`UPDATE events.uploads SET hidden = true WHERE ${where}`;
    if (action === 'show') await tx`UPDATE events.uploads SET hidden = false WHERE ${where}`;
    if (action === 'feature') await tx`UPDATE events.uploads SET featured = true WHERE ${where}`;
    if (action === 'unfeature') await tx`UPDATE events.uploads SET featured = false WHERE ${where}`;
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
