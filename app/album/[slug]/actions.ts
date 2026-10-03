'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { logActivity } from '@/lib/events/activity';
import { parseClient } from '@/lib/request-meta';
import { codeHmac, normalizeCode, qrHash } from '@/lib/events/codes';
import { cleanName } from '@/lib/events/rules';
import { endGuestSession, publicEvent, startGuestSession } from '@/lib/events/session';
import { rateLimit } from '@/lib/rate-limit';

export interface JoinState {
  error?: string;
  name?: string;
  code?: string;
}

async function ip() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function joinWithCode(_prev: JoinState, form: FormData): Promise<JoinState> {
  const slug = String(form.get('slug') ?? '');
  const typed = String(form.get('code') ?? '');
  const name = cleanName(String(form.get('name') ?? ''));
  const echo = { name: String(form.get('name') ?? ''), code: typed };
  if (!name) return { error: 'Please tell us your name.', ...echo };
  const code = normalizeCode(typed);
  // Codes are short, so attempts are limited per network and per album.
  if (!rateLimit(`code:${await ip()}`, 10, 15 * 60_000) || !rateLimit(`code-album:${slug}`, 200, 15 * 60_000)) {
    return { error: 'Too many tries. Wait a few minutes and try again.', ...echo };
  }
  const client = parseClient(form.get('client'));
  const event = await publicEvent(slug);
  const [match] = code && event
    ? await sql<{ access_code_id: string }[]>`SELECT access_code_id FROM events.resolve_code(${slug}, ${codeHmac(code)})`
    : [];
  const guestId = event && match ? await startGuestSession(slug, match.access_code_id, 'code', name) : null;
  await logActivity({
    eventId: event?.id ?? null,
    action: guestId ? 'guest.join' : 'guest.code_failed',
    guestId,
    actorName: name,
    client,
    // The wrong code someone typed is kept: it shows guessing.
    detail: { via: 'code', slug, ...(guestId ? { access_code_id: match!.access_code_id } : { tried: typed.slice(0, 40) }) },
  });
  if (!guestId) return { error: 'That code doesn’t match this album. Check it and try again.', ...echo };
  redirect(`/album/${slug}`);
}

export async function joinWithQr(_prev: JoinState, form: FormData): Promise<JoinState> {
  const slug = String(form.get('slug') ?? '');
  const token = String(form.get('token') ?? '');
  const name = cleanName(String(form.get('name') ?? ''));
  if (!name) return { error: 'Please tell us your name.' };
  if (!rateLimit(`qr:${await ip()}`, 30, 15 * 60_000)) return { error: 'Too many tries. Wait a few minutes.' };
  const client = parseClient(form.get('client'));
  const [match] = await sql<{ access_code_id: string; event_id: string; slug: string }[]>`
    SELECT access_code_id, event_id, slug FROM events.resolve_qr(${qrHash(token)})`;
  const ok = match && match.slug === slug;
  const guestId = ok ? await startGuestSession(slug, match.access_code_id, 'qr', name) : null;
  const event = ok ? null : await publicEvent(slug);
  await logActivity({
    eventId: match?.event_id ?? event?.id ?? null,
    action: guestId ? 'guest.join' : 'guest.qr_failed',
    guestId,
    actorName: name,
    client,
    detail: { via: 'qr', slug, ...(guestId ? { access_code_id: match!.access_code_id } : {}) },
  });
  if (!guestId) return { error: 'This QR code isn’t active anymore. Ask the host for a new one.' };
  redirect(`/album/${slug}`);
}

export async function leaveAlbum(form: FormData): Promise<void> {
  const slug = String(form.get('slug') ?? '');
  if (!/^[a-z0-9-]+$/.test(slug)) redirect('/');
  await endGuestSession(slug);
  redirect(`/album/${slug}`);
}
