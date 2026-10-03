'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collectClientInfo } from '@/lib/client-info';
import { renderPreview } from '@/lib/compositor';
import { isPlain, type Overlay } from '@/lib/events/overlay';
import { Decorator } from './Decorator';
import { PART_SIZE } from '@/lib/events/limits';
import { formatBytes, uploadProblem } from '@/lib/events/rules';
import { listUploads, patchUpload, removeUpload, saveUpload, type StoredUpload } from '@/lib/upload-store';
import { NUDGE_EVENT, PausedError, put, withRetries } from '@/lib/upload-transfer';

// Phone uploader. What it's built to survive:
// - Switching apps / locking the phone: transfers that stall are restarted
//   when the page comes back; big files resume from the last stored part.
// - The tab being reloaded or discarded: the queue (and the files, when the
//   browser allows) is kept in IndexedDB and picks up on the next visit.
//   If a file couldn't be kept, choosing it again resumes it.
// - Bad networks: retries with backoff, waits while offline, then "Paused"
//   with a Resume button rather than a silent failure.
// Originals are never touched; photos also get a small preview made here,
// which drops location metadata because it is re-encoded.

type Status = 'queued' | 'uploading' | 'finishing' | 'done' | 'paused' | 'needs-file' | 'failed' | 'rejected';

interface Item {
  key: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  file: File | null;
  serverId?: string;
  mode?: 'single' | 'multipart';
  partCount?: number;
  status: Status;
  progress: number;
  note?: string;
  /** Frame/filter/caption chosen for this item, and the one the server has. */
  overlay?: Overlay | null;
  savedOverlay?: Overlay | null;
}

const CONCURRENCY = 2;
const PART_BATCH = 10;

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', gif: 'image/gif',
  mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', '3gp': 'video/3gpp',
};

/** Some Android browsers give an empty type; fall back to the extension. */
function fileType(f: File): string {
  if (f.type) return f.type;
  const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? 'application/octet-stream';
}

class HttpError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}

async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(data.error ?? `Something went wrong (${res.status})`, res.status, data);
  return data as T;
}

/**
 * Same file as one we were uploading before (for re-picking after a reload).
 * Not by modified date: phones often report the time it was picked.
 */
const sameFile = (a: { name: string; size: number; type: string }, f: File) =>
  a.size === f.size && (a.name === f.name || a.type === fileType(f));

export function Uploader({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const running = useRef(new Map<string, AbortController>());
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const base = `/album/${slug}/api/uploads`;

  const update = useCallback((key: string, patch: Partial<Item>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }, []);

  // Restore anything left over from an earlier visit.
  useEffect(() => {
    listUploads(slug).then((saved) => {
      if (!saved.length) return;
      setItems((xs) => [
        ...xs,
        ...saved
          .filter((s) => !xs.some((x) => x.key === s.key))
          .map<Item>((s) => ({
            key: s.key, name: s.name, size: s.size, type: s.type, lastModified: s.lastModified,
            file: s.file ?? null, serverId: s.serverId, mode: s.mode, partCount: s.partCount,
            status: s.file ? 'queued' : 'needs-file', progress: 0,
            note: s.file ? 'Picking up where it left off…' : 'Choose this file again to finish uploading it.',
          })),
      ]);
    });
  }, [slug]);

  const process = useCallback(
    async (start: Item, signal: AbortSignal) => {
      const key = start.key;
      const file = start.file!;
      const isPhoto = start.type.startsWith('image/');
      let { serverId, mode, partCount } = start;
      let previewUrl: string | null | undefined;
      update(key, { status: 'uploading', note: undefined });

      if (!serverId) {
        const created = await api<{ id: string; mode: 'single' | 'multipart'; partCount: number; uploadUrl: string | null; previewUrl: string | null }>(base, {
          name: start.name, type: start.type, size: start.size, preview: isPhoto,
          lastModified: start.lastModified, client: await collectClientInfo().catch(() => null),
        });
        ({ id: serverId, mode, partCount } = created);
        previewUrl = created.previewUrl;
        update(key, { serverId, mode, partCount });
        await patchUpload(key, { serverId, mode, partCount });
      }
      const itemUrl = `${base}/${serverId}`;
      // Plain preview made while the original uploads; a decorated one is
      // rendered at the end from whatever frame the person picked meanwhile.
      const plainPreview = isPhoto ? renderPreview(file, null) : Promise.resolve(null);

      // Up to two passes: if completion reports missing parts, send them.
      for (let pass = 0; pass < 3; pass++) {
        if (mode === 'multipart') {
          const status = await api<{ complete?: boolean; missing?: number[] }>(itemUrl, { action: 'status' });
          if (status.complete) break;
          const missing = status.missing ?? [];
          let doneBytes = start.size - missing.reduce((n, p) => n + Math.min(PART_SIZE, start.size - (p - 1) * PART_SIZE), 0);
          update(key, { progress: doneBytes / start.size });
          for (let i = 0; i < missing.length; i += PART_BATCH) {
            const batch = missing.slice(i, i + PART_BATCH);
            let urls = (await api<{ urls: Record<number, string> }>(itemUrl, { action: 'parts', parts: batch })).urls;
            for (const n of batch) {
              const blob = file.slice((n - 1) * PART_SIZE, Math.min(n * PART_SIZE, start.size));
              await withRetries(
                async (attempt) => {
                  if (attempt > 0) {
                    // The reply may have been lost rather than the part: check before resending.
                    const st = await api<{ complete?: boolean; missing?: number[] }>(itemUrl, { action: 'status' });
                    if (st.complete || !st.missing?.includes(n)) return null;
                    urls = (await api<{ urls: Record<number, string> }>(itemUrl, { action: 'parts', parts: [n] })).urls;
                  }
                  return urls[n]!;
                },
                (url) => put(url, blob, null, (loaded) => update(key, { progress: (doneBytes + loaded) / start.size }), signal),
                (attempt) => update(key, { note: `Connection trouble, retrying (${attempt})…` }),
                signal,
              );
              doneBytes += blob.size;
              update(key, { progress: doneBytes / start.size, note: undefined });
            }
          }
        } else {
          const status = pass === 0 && start.serverId ? await api<{ complete?: boolean; uploaded?: boolean }>(itemUrl, { action: 'status' }) : {};
          if (status.complete) break;
          if (!status.uploaded) {
            await withRetries(
              async (attempt) => {
                if (attempt > 0) {
                  const st = await api<{ complete?: boolean; uploaded?: boolean }>(itemUrl, { action: 'status' });
                  if (st.complete || st.uploaded) return null;
                }
                return (await api<{ uploadUrl: string }>(itemUrl, { action: 'url' })).uploadUrl;
              },
              (url) => put(url, file, start.type, (loaded) => update(key, { progress: loaded / start.size }), signal),
              (attempt) => update(key, { note: `Connection trouble, retrying (${attempt})…`, progress: 0 }),
              signal,
            );
          }
        }

        update(key, { status: 'finishing', progress: 1, note: undefined });
        const chosen = itemsRef.current.find((x) => x.key === key)?.overlay ?? null;
        const blob = isPhoto && chosen && !isPlain(chosen) ? await renderPreview(file, chosen) : await plainPreview;
        if (blob) {
          previewUrl ??= (await api<{ previewUrl: string | null }>(itemUrl, { action: 'preview' })).previewUrl;
          if (previewUrl) await put(previewUrl, blob, 'image/jpeg').catch(() => {});
        }
        try {
          await api(itemUrl, { action: 'complete' });
          if (chosen && !isPlain(chosen)) await api(itemUrl, { action: 'decorate', overlay: chosen }).catch(() => {});
          update(key, { savedOverlay: chosen });
          break;
        } catch (err) {
          // Parts missing (e.g. a part was lost): go round again for just those.
          if (err instanceof HttpError && err.status === 409 && pass < 2) {
            update(key, { status: 'uploading', note: 'Resuming…' });
            continue;
          }
          throw err;
        }
      }
      update(key, { status: 'done', note: undefined, progress: 1 });
      await removeUpload(key);
    },
    [base, update],
  );

  const runItem = useCallback(
    (item: Item) => {
      const ctl = new AbortController();
      running.current.set(item.key, ctl);
      process(item, ctl.signal)
        .catch((err) => {
          if (ctl.signal.aborted) return;
          if (err instanceof PausedError) update(item.key, { status: 'paused', note: err.message });
          else if (err instanceof HttpError && err.status < 500 && err.status !== 409 && err.status !== 429) update(item.key, { status: 'failed', note: err.message });
          else update(item.key, { status: 'paused', note: 'Upload paused. Tap Resume, or it will continue when the connection is back.' });
        })
        .finally(() => running.current.delete(item.key));
    },
    [process, update],
  );

  // Start queued items, two at a time.
  useEffect(() => {
    const active = items.filter((i) => running.current.has(i.key)).length;
    const next = items.filter((i) => i.status === 'queued' && !running.current.has(i.key)).slice(0, Math.max(0, CONCURRENCY - active));
    for (const item of next) runItem(item);
  }, [items, runItem]);

  const resumeAll = useCallback(() => {
    setItems((xs) => xs.map((x) => (x.status === 'paused' && x.file ? { ...x, status: 'queued', note: 'Resuming…' } : x)));
  }, []);

  // Coming back to the page or the network: nudge stalled transfers, resume paused ones.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      window.dispatchEvent(new Event(NUDGE_EVENT));
      resumeAll();
    };
    window.addEventListener('online', resumeAll);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      window.removeEventListener('online', resumeAll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [resumeAll]);

  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'finishing');
  const doneCount = items.filter((i) => i.status === 'done').length;
  const paused = items.filter((i) => i.status === 'paused');
  const needFiles = items.filter((i) => i.status === 'needs-file');

  // Keep the screen awake and warn before leaving while uploads run.
  useEffect(() => {
    if (!busy) {
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
      return;
    }
    const acquire = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible' && !wakeLock.current) {
          wakeLock.current = await nav.wakeLock.request('screen');
        }
      } catch {
        /* not supported or denied */
      }
    };
    const onVisible = () => {
      wakeLock.current = null;
      acquire();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [busy]);

  // Show new uploads in the album once a batch finishes.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && doneCount > 0) router.refresh();
    wasBusy.current = busy;
  }, [busy, doneCount, router]);

  function pick(files: FileList | null) {
    if (!files?.length) return;
    const fresh: Item[] = [];
    const reattached = new Map<string, File>();
    for (const [i, file] of Array.from(files).entries()) {
      const waiting = itemsRef.current.find((x) => x.status === 'needs-file' && !reattached.has(x.key) && sameFile(x, file));
      if (waiting) {
        reattached.set(waiting.key, file);
        continue;
      }
      const type = fileType(file);
      const problem = uploadProblem({ type, size: file.size });
      fresh.push({
        key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || 'Photo', size: file.size, type, lastModified: file.lastModified, file,
        status: problem ? 'rejected' : 'queued', progress: 0, note: problem ?? undefined,
      });
    }
    setItems((xs) => [
      ...fresh,
      ...xs.map((x) => (reattached.has(x.key) ? { ...x, file: reattached.get(x.key)!, status: 'queued' as const, note: 'Picking up where it left off…' } : x)),
    ]);
    // Remember the queue (and files, if the browser lets us) in case the page goes away.
    for (const it of fresh.filter((f) => f.status === 'queued')) {
      const rec: StoredUpload = { key: it.key, slug, name: it.name, size: it.size, type: it.type, lastModified: it.lastModified, createdAt: Date.now(), file: it.file! };
      void saveUpload(rec);
    }
    for (const [k, file] of reattached) void patchUpload(k, { file });
  }

  const [decorating, setDecorating] = useState<string | null>(null);
  const decoratingItem = items.find((x) => x.key === decorating);

  // Applies a frame to an upload that already finished (or re-decorates).
  // Pending uploads pick up the chosen frame when they finish; anything
  // chosen after that (or in the last second) is applied by the effect below.
  const applying = useRef(new Set<string>());
  const applyOverlay = useCallback(
    async (key: string, overlay: Overlay) => {
      const it = itemsRef.current.find((x) => x.key === key);
      if (!it || it.status !== 'done' || !it.serverId || !it.file) return;
      applying.current.add(key);
      update(key, { note: 'Saving frame…' });
      try {
        const res = await api<{ previewUrl: string | null }>(`${base}/${it.serverId}`, { action: 'decorate', overlay });
        if (res.previewUrl && it.type.startsWith('image/')) {
          const blob = await renderPreview(it.file, overlay);
          if (blob) await put(res.previewUrl, blob, 'image/jpeg');
        }
        update(key, { savedOverlay: overlay, note: isPlain(overlay) ? undefined : 'Frame saved ✓' });
        router.refresh();
      } catch (err) {
        update(key, { savedOverlay: overlay, note: (err as Error).message });
      } finally {
        applying.current.delete(key);
      }
    },
    [base, router, update],
  );

  useEffect(() => {
    for (const it of items) {
      if (it.status === 'done' && it.overlay && it.overlay !== it.savedOverlay && !applying.current.has(it.key)) {
        void applyOverlay(it.key, it.overlay);
      }
    }
  }, [items, applyOverlay]);

  function dismiss(key: string) {
    running.current.get(key)?.abort();
    setItems((xs) => xs.filter((x) => x.key !== key));
    void removeUpload(key);
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-light/50 px-4 py-8 text-center hover:border-brand">
        <span className="text-lg font-semibold text-brand-dark">Add photos &amp; videos</span>
        <span className="text-sm text-stone-600">Adding as {name}. Pick as many as you like.</span>
        <input type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      </label>

      {busy && (
        <div className="rounded-xl bg-amber-100 p-3 text-center font-medium text-amber-900" role="status">
          Uploading {items.filter((i) => i.status === 'done').length} of {items.filter((i) => i.status !== 'rejected').length}. Keep this page open; if you switch apps, it will pick up when you come back.
        </div>
      )}
      {!busy && paused.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-100 p-3 text-sm" role="status">
          <span>{paused.length} upload{paused.length > 1 ? 's' : ''} paused.</span>
          <button type="button" className="btn py-1" onClick={resumeAll}>Resume</button>
        </div>
      )}
      {needFiles.length > 0 && (
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900" role="status">
          {needFiles.length} upload{needFiles.length > 1 ? 's were' : ' was'} interrupted. Tap <b>Add photos &amp; videos</b> and choose{' '}
          {needFiles.map((f) => f.name).join(', ')} again to finish. Already-sent parts won’t upload twice.
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-2" aria-label="Uploads">
          {items.map((it) => (
            <li key={it.key} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{it.name} <span className="text-stone-500">{formatBytes(it.size)}</span></span>
                <span className="shrink-0 text-stone-600">
                  {it.status === 'queued' && 'Waiting'}
                  {it.status === 'uploading' && `${Math.round(it.progress * 100)}%`}
                  {it.status === 'finishing' && 'Finishing'}
                  {it.status === 'done' && <span className="text-green-700">Added ✓</span>}
                  {it.status === 'paused' && <span className="text-amber-700">Paused {Math.round(it.progress * 100)}%</span>}
                  {it.status === 'needs-file' && <span className="text-blue-700">Choose again</span>}
                  {(it.status === 'failed' || it.status === 'rejected') && <span className="text-red-600">Not added</span>}
                </span>
              </div>
              {(it.status === 'uploading' || it.status === 'finishing' || it.status === 'paused') && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full transition-all ${it.status === 'paused' ? 'bg-amber-400' : 'bg-brand'}`} style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </div>
              )}
              {it.note && <p className={`mt-1 ${it.status === 'failed' || it.status === 'rejected' ? 'text-red-600' : 'text-stone-500'}`}>{it.note}</p>}
              {(it.status === 'failed' || it.status === 'paused') && it.file && (
                <button type="button" className="mt-2 mr-4 text-brand underline" onClick={() => update(it.key, { status: 'queued', note: 'Resuming…' })}>
                  {it.status === 'failed' ? 'Try again' : 'Resume'}
                </button>
              )}
              {it.file && ['queued', 'uploading', 'finishing', 'done', 'paused'].includes(it.status) && (
                <button type="button" className="mt-2 mr-4 text-brand underline" onClick={() => setDecorating(it.key)}>
                  {it.overlay && !isPlain(it.overlay) ? 'Change frame' : 'Add frame'}
                </button>
              )}
              {it.status !== 'done' && it.status !== 'uploading' && it.status !== 'finishing' && (
                <button type="button" className="mt-2 text-stone-500 underline" onClick={() => dismiss(it.key)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {decoratingItem?.file && (
        <Decorator
          file={decoratingItem.file}
          initial={decoratingItem.overlay}
          onClose={() => setDecorating(null)}
          onSave={(o) => {
            setDecorating(null);
            update(decoratingItem.key, { overlay: o });
          }}
        />
      )}
    </div>
  );
}
