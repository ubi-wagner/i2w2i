'use client';

import {
  decryptJson, encryptJson, importAesKey, makeInvite, newPodKeyBytes, openInvite, unwrapWithPassphrase, wrapWithPassphrase,
  type PassphraseWrapped, type Wrapped,
} from '../crypto';
import { cleanMenu, starterMenu, type Menu } from '../menu';
import type { Role } from '../rules';
import { api } from './api';
import { saveKey } from './keystore';

// The phone side of the pod key: making it, unlocking it on a new phone with
// the vault passphrase, joining from a key link, and inviting a partner.
// The server only ever sees wrapped keys and ciphertext.

export interface PodSettings { name: string }

export const MIN_PASSPHRASE = 8;

export function passphraseProblem(p: string): string | null {
  if (p.trim().length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters; a few words is best.`;
  if (p.length > 200) return 'That’s too long.';
  return null;
}

/** The link a partner opens: the secret rides in the #fragment, which browsers never send to the server. */
export function joinLink(podId: string, secret: string): string {
  return `${location.origin}/join#p=${podId}&k=${secret}`;
}

export function parseJoinFragment(hash: string): { podId: string; secret: string } | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const podId = q.get('p') ?? '';
  const secret = q.get('k') ?? '';
  return /^[0-9a-f-]{36}$/.test(podId) && /^[A-Za-z0-9_-]{22}$/.test(secret) ? { podId, secret } : null;
}

// Right after making a pod, its raw key stays in memory for a moment, so
// adding a partner doesn't mean typing the passphrase straight back in.
const fresh = new Map<string, Uint8Array<ArrayBuffer>>();
export function takeFreshKey(podId: string): Uint8Array<ArrayBuffer> | undefined {
  return fresh.get(podId);
}
export function dropFreshKey(podId: string): void {
  fresh.delete(podId);
}

export async function createPod(opts: { role: Role; name: string; titles: { lead: string; follow: string }; passphrase: string }): Promise<{ podId: string; raw: Uint8Array<ArrayBuffer> }> {
  const podId = crypto.randomUUID();
  const raw = newPodKeyBytes();
  const key = await importAesKey(raw);
  const menu = cleanMenu({ ...starterMenu(), titles: opts.titles });
  await api('/api/pods', {
    body: {
      id: podId,
      role: opts.role,
      settingsEnc: await encryptJson(key, { name: opts.name } satisfies PodSettings, `settings:${podId}`),
      menuEnc: await encryptJson(key, menu, `menu:${podId}`),
      keyBackup: await wrapWithPassphrase(raw, opts.passphrase, podId),
    },
  });
  await saveKey(podId, key);
  fresh.set(podId, raw);
  return { podId, raw };
}

export async function unlock(podId: string, backup: PassphraseWrapped, passphrase: string): Promise<CryptoKey> {
  const raw = await unwrapWithPassphrase(backup, passphrase, podId).catch(() => {
    throw new Error('That passphrase didn’t open it. Check it and try again.');
  });
  const key = await importAesKey(raw);
  await saveKey(podId, key);
  return key;
}

/** Raw pod key bytes, briefly, for wrapping it again (an invite, a new passphrase). */
export async function rawKey(podId: string, backup: PassphraseWrapped, passphrase: string): Promise<Uint8Array<ArrayBuffer>> {
  return unwrapWithPassphrase(backup, passphrase, podId).catch(() => {
    throw new Error('That passphrase didn’t open it. Check it and try again.');
  });
}

export async function join(podId: string, invite: Wrapped, secret: string, passphrase: string): Promise<CryptoKey> {
  const raw = await openInvite(invite, secret, podId).catch(() => {
    throw new Error('This key link doesn’t match. Ask for a new one.');
  });
  await api('/api/join', { body: { podId, keyBackup: await wrapWithPassphrase(raw, passphrase, podId) } });
  const key = await importAesKey(raw);
  await saveKey(podId, key);
  return key;
}

export interface Credentials { name: string; username: string; password?: string }

export async function addPartner(podId: string, raw: Uint8Array<ArrayBuffer>, person: { name: string; username: string; password: string; role: Role }): Promise<{ credentials: Credentials; link: string }> {
  const { secret, wrapped } = await makeInvite(raw, podId);
  const r = await api<{ credentials: Credentials }>(`/api/pods/${podId}/members`, { body: { ...person, invite: wrapped } });
  return { credentials: r.credentials, link: joinLink(podId, secret) };
}

export async function reinvite(podId: string, raw: Uint8Array<ArrayBuffer>, accountId: string, resetPassword: boolean): Promise<{ credentials: Credentials; link: string }> {
  const { secret, wrapped } = await makeInvite(raw, podId);
  const r = await api<{ credentials: Credentials }>(`/api/pods/${podId}/members/${accountId}`, { body: { invite: wrapped, resetPassword } });
  return { credentials: r.credentials, link: joinLink(podId, secret) };
}

export async function changePassphrase(podId: string, backup: PassphraseWrapped, oldPass: string, newPass: string): Promise<void> {
  const raw = await rawKey(podId, backup, oldPass);
  await api(`/api/pods/${podId}/backup`, { method: 'PUT', body: { keyBackup: await wrapWithPassphrase(raw, newPass, podId) } });
}

export async function readPod(key: CryptoKey, podId: string, settingsEnc: string, menuEnc: string): Promise<{ settings: PodSettings; menu: Menu }> {
  const [settings, menu] = await Promise.all([
    decryptJson<PodSettings>(key, settingsEnc, `settings:${podId}`),
    decryptJson(key, menuEnc, `menu:${podId}`).then(cleanMenu),
  ]);
  return { settings, menu };
}
