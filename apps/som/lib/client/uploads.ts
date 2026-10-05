'use client';

import { useSyncExternalStore } from 'react';
import { uploadMedia, type Progress } from './upload';

// Uploads in progress, for the whole app: they carry on (and stay visible,
// failures included) when the sheet that started them closes, and "Send for
// review" can wait for them. Leaving or reloading the page while one is
// running asks first.

export interface Pending { id: string; mediaId?: string; sceneId: string; taskId: string | null; entryId: string | null; name: string; p: Progress }

let items: Pending[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (id: string, patch: Partial<Pending>) => { items = items.map((x) => (x.id === id ? { ...x, ...patch } : x)); emit(); };

const running = () => items.some((x) => x.p.state === 'preparing' || x.p.state === 'uploading');
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (running()) e.preventDefault(); });
}

/** Starts sending a file; `onDone` once the server has all of it. */
export function startUpload(file: File, opts: { sceneId: string; taskId?: string | null; entryId?: string | null; key: CryptoKey }, onDone?: () => void): void {
  const id = crypto.randomUUID();
  items = [...items, { id, sceneId: opts.sceneId, taskId: opts.taskId ?? null, entryId: opts.entryId ?? null, name: file.name || 'recording', p: { sent: 0, total: file.size, state: 'preparing' } }];
  emit();
  uploadMedia(file, { ...opts, onProgress: (p) => set(id, { p }) })
    .then(() => {
      items = items.filter((x) => x.id !== id);
      emit();
      onDone?.();
    })
    .catch((err) => set(id, { p: { sent: 0, total: file.size, state: 'error', error: (err as Error).message } }));
}

export function dismissUpload(id: string): void {
  items = items.filter((x) => x.id !== id);
  emit();
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => items;
const none: Pending[] = [];

/** This scene's uploads in progress (or failed), optionally only one task's. */
export function usePendingUploads(sceneId: string, taskId?: string | null): Pending[] {
  const all = useSyncExternalStore(subscribe, snapshot, () => none);
  return all.filter((x) => x.sceneId === sceneId && (taskId === undefined || x.taskId === taskId));
}

/** Whether anything is being sent from this phone right now. */
export function useAnyUploading(): boolean {
  return useSyncExternalStore(subscribe, running, () => false);
}
