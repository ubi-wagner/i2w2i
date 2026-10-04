'use client';

import { decryptAll, decryptChunk, decryptJson, unwrapFileKey } from '../crypto';
import { api } from './api';
import type { MediaMeta } from './upload';

// Showing media: fetch the ciphertext, decrypt on the phone, hand the result
// to <img>/<video>/<audio> as a local object URL. Decrypted copies only ever
// exist in this page's memory.

export interface MediaRow {
  id: string;
  task_id: string | null;
  entry_id: string | null;
  uploader_id: string;
  bytes: string | number;
  thumb_bytes: number | null;
  chunk_bytes: number;
  file_key_enc: string;
  nonce: string;
  thumb_nonce: string | null;
  meta_enc: string;
  status: 'uploading' | 'ready';
  created_at: string;
}

const metas = new Map<string, Promise<MediaMeta>>();
const urls = new Map<string, Promise<string>>();
const thumbs = new Map<string, Promise<string | null>>();

export function mediaMeta(m: MediaRow, key: CryptoKey): Promise<MediaMeta> {
  if (!metas.has(m.id)) metas.set(m.id, decryptJson<MediaMeta>(key, m.meta_enc, `media:${m.id}`));
  return metas.get(m.id)!;
}

async function links(id: string) {
  return api<{ url: string; thumbUrl: string | null }>(`/api/media/${id}`);
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Couldn’t load it. Try again.');
  return res.arrayBuffer();
}

export function thumbUrl(m: MediaRow, key: CryptoKey): Promise<string | null> {
  if (!m.thumb_nonce) return Promise.resolve(null);
  if (!thumbs.has(m.id)) {
    thumbs.set(m.id, (async () => {
      const { thumbUrl: u } = await links(m.id);
      if (!u) return null;
      const fk = await unwrapFileKey(key, m.file_key_enc, m.id);
      const plain = await decryptChunk(fk, m.thumb_nonce!, 0, true, await fetchBytes(u));
      return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
    })().catch((err) => { thumbs.delete(m.id); throw err; }));
  }
  return thumbs.get(m.id)!;
}

/** The whole file, decrypted, as an object URL. */
export function fileUrl(m: MediaRow, key: CryptoKey): Promise<string> {
  if (!urls.has(m.id)) {
    urls.set(m.id, (async () => {
      const [{ url }, meta, fk] = await Promise.all([links(m.id), mediaMeta(m, key), unwrapFileKey(key, m.file_key_enc, m.id)]);
      const parts = await decryptAll(fk, m.nonce, await fetchBytes(url), m.chunk_bytes);
      return URL.createObjectURL(new Blob(parts, { type: meta.type || 'application/octet-stream' }));
    })().catch((err) => { urls.delete(m.id); throw err; }));
  }
  return urls.get(m.id)!;
}

/** Saves a decrypted copy to this phone (the share sheet's "Save" on phones, a download elsewhere). */
export async function saveToDevice(m: MediaRow, key: CryptoKey): Promise<void> {
  const [url, meta] = await Promise.all([fileUrl(m, key), mediaMeta(m, key)]);
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], meta.name, { type: meta.type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    await navigator.share({ files: [file] }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = meta.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function forget(id: string): void {
  for (const map of [urls, thumbs]) {
    const p = map.get(id);
    map.delete(id);
    p?.then((u) => u && URL.revokeObjectURL(u)).catch(() => {});
  }
  metas.delete(id);
}
