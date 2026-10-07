'use client';

import { CHUNK_BYTES, chunkCount, encryptChunk, encryptedSize, encryptJson, newFileKey, newNonce, wrapFileKey } from '../crypto';
import { api } from './api';

// Sending a photo, video or voice note: prepared on the phone (photos are
// re-drawn, which drops location and camera details), a thumbnail made,
// everything encrypted in chunks, and uploaded straight to the bucket.
// Each chunk retries on its own, with fresh links if they've expired.

export type MediaKind = 'photo' | 'video' | 'audio' | 'file';

export interface MediaMeta {
  name: string;
  type: string;
  size: number;
  kind: MediaKind;
  width?: number;
  height?: number;
  duration?: number;
}

export interface Progress {
  sent: number;
  total: number;
  state: 'preparing' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function kindOf(type: string): MediaKind {
  if (type.startsWith('image/')) return 'photo';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

const MAX_SIDE = 4096;
const THUMB_SIDE = 480;

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode'))), 'image/jpeg', quality));
}

async function drawScaled(src: CanvasImageSource, w: number, h: number, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(src, 0, 0, width, height);
  return { blob: await canvasBlob(canvas, quality), width, height };
}

/** How long a voice note recorded in the app is, in seconds. */
export const recordedLength = new WeakMap<Blob, number>();

/** Photos are re-drawn as JPEG: no location, no camera details, sensible size. Anything else as is. */
async function prepare(file: File): Promise<{ blob: Blob; meta: MediaMeta; thumb: Blob | null }> {
  const type = file.type || 'application/octet-stream';
  const kind = kindOf(type);
  const name = file.name || `${kind}-${Date.now()}`;
  if (kind === 'photo') {
    try {
      const bmp = await createImageBitmap(file);
      const full = await drawScaled(bmp, bmp.width, bmp.height, MAX_SIDE, 0.9);
      const thumb = await drawScaled(bmp, bmp.width, bmp.height, THUMB_SIDE, 0.75);
      bmp.close();
      return {
        blob: full.blob,
        meta: { name: name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', size: full.blob.size, kind, width: full.width, height: full.height },
        thumb: thumb.blob,
      };
    } catch {
      // A format this browser can't draw: send it unchanged.
    }
  }
  const meta: MediaMeta = { name, type, size: file.size, kind };
  let thumb: Blob | null = null;
  if (kind === 'video') {
    const t = await videoThumb(file).catch(() => null);
    if (t) {
      thumb = t.blob;
      Object.assign(meta, { width: t.width, height: t.height, duration: t.duration });
    }
  }
  if (kind === 'audio') {
    // A recording made here says how long it is (Chrome's own files don't).
    const d = (await mediaDuration(file, 'audio').catch(() => undefined)) ?? recordedLength.get(file);
    if (d) meta.duration = d;
  }
  return { blob: file, meta, thumb };
}

function mediaDuration(file: Blob, tag: 'audio' | 'video'): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement(tag);
    const url = URL.createObjectURL(file);
    const done = (v?: number) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : undefined);
    el.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 5000);
    el.src = url;
  });
}

function videoThumb(file: Blob): Promise<{ blob: Blob; width: number; height: number; duration?: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const fail = () => { URL.revokeObjectURL(url); reject(new Error('no thumbnail')); };
    const timer = setTimeout(fail, 8000);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = async () => {
      clearTimeout(timer);
      try {
        const t = await drawScaled(v, v.videoWidth, v.videoHeight, THUMB_SIDE, 0.75);
        URL.revokeObjectURL(url);
        resolve({ ...t, width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? Math.round(v.duration) : undefined });
      } catch {
        fail();
      }
    };
    v.onerror = fail;
    v.src = url;
  });
}

/** A piece that hasn't gone in two minutes has stalled: give up on it and try again. */
const PART_TIMEOUT_MS = 120_000;

async function put(url: string, data: ArrayBuffer | Blob, single: boolean): Promise<void> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PART_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'PUT', body: data, headers: single ? { 'content-type': 'application/octet-stream' } : undefined, signal: stop.signal });
    if (!res.ok) throw Object.assign(new Error(`upload failed (${res.status})`), { status: res.status });
  } finally {
    clearTimeout(timer);
  }
}

/** Above this, a video or file is too big to open again on a phone (it's decrypted in memory). */
export const MAX_SEND_BYTES = 250 * 1024 * 1024;

/** Why a file can't be sent, or null. */
export function cantSend(file: File): string | null {
  if (!file.size) return 'That file is empty (a recording that didn’t start?). Try again.';
  if (kindOf(file.type || '') !== 'photo' && file.size > MAX_SEND_BYTES) {
    return `That’s ${Math.round(file.size / 1024 / 1024)} MB: too big to open again on a phone. Trim it or send a shorter one (up to 250 MB).`;
  }
  return null;
}

async function withRetries<T>(fn: (attempt: number) => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(i);
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, Math.min(15_000, 700 * 2 ** i)));
    }
  }
  throw last;
}

/** Encrypts and uploads one file to a scene. Resolves with the media id once the server has all of it. */
export async function uploadMedia(file: File, opts: { sceneId: string; taskId?: string | null; entryId?: string | null; key: CryptoKey; onProgress?: (p: Progress) => void }): Promise<string> {
  const report = opts.onProgress ?? (() => {});
  const problem = cantSend(file);
  if (problem) throw new Error(problem);
  report({ sent: 0, total: file.size, state: 'preparing' });
  const { blob, meta, thumb } = await prepare(file);
  const id = crypto.randomUUID();
  const fk = await newFileKey();
  const nonce = newNonce();
  const thumbNonce = newNonce();
  const thumbCipher = thumb ? await encryptChunk(fk.key, thumbNonce, 0, true, await thumb.arrayBuffer()) : null;
  const n = chunkCount(blob.size, CHUNK_BYTES);
  const plan = await api<{ put?: string; parts?: Record<number, string>; thumbPut?: string }>(`/api/scenes/${opts.sceneId}/media`, {
    body: {
      id,
      taskId: opts.taskId ?? null,
      entryId: opts.entryId ?? null,
      bytes: encryptedSize(blob.size, CHUNK_BYTES),
      chunkBytes: CHUNK_BYTES,
      fileKeyEnc: await wrapFileKey(opts.key, fk, id),
      nonce,
      metaEnc: await encryptJson(opts.key, meta, `media:${id}`),
      thumb: thumbCipher ? { bytes: thumbCipher.byteLength, nonce: thumbNonce } : null,
    },
  });
  report({ sent: 0, total: blob.size, state: 'uploading' });
  if (thumbCipher && plan.thumbPut) await withRetries(() => put(plan.thumbPut!, thumbCipher, true));

  let urls = plan.parts ?? {};
  let sent = 0;
  for (let i = 0; i < n; i++) {
    const plain = await blob.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES).arrayBuffer();
    const cipher = await encryptChunk(fk.key, nonce, i, i === n - 1, plain);
    await withRetries(async (attempt) => {
      if (plan.put) {
        if (attempt > 0) plan.put = (await api<{ put: string }>(`/api/media/${id}/parts`, { body: { parts: [] } })).put;
        return put(plan.put!, cipher, true);
      }
      if (attempt > 0 || !urls[i + 1]) urls = { ...urls, ...(await api<{ parts: Record<number, string> }>(`/api/media/${id}/parts`, { body: { parts: [i + 1] } })).parts };
      return put(urls[i + 1]!, cipher, false);
    });
    sent += plain.byteLength;
    report({ sent, total: blob.size, state: 'uploading' });
  }
  await withRetries(() => api(`/api/media/${id}/complete`, { body: {} }), 3);
  report({ sent: blob.size, total: blob.size, state: 'done' });
  return id;
}
