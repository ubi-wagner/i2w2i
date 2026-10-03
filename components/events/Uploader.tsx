'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collectClientInfo } from '@/lib/client-info';
import { PREVIEW_LONG_EDGE } from '@/lib/events/limits';
import { formatBytes, uploadProblem } from '@/lib/events/rules';

// Phone uploader. Lessons baked in from the planning notes:
// - XHR, not fetch, so people see progress on a 400 MB video.
// - Two at a time: venue wifi and LTE are bad.
// - Every attempt gets a fresh presigned URL; 3 tries, then a Retry button.
// - Hold a screen wake lock while uploading; a locked phone kills uploads.
// - Originals are never touched. Photos also get a small preview made here,
//   which drops location metadata because it is re-encoded.

type Status = 'queued' | 'uploading' | 'finishing' | 'done' | 'failed' | 'rejected';

interface Item {
  key: string;
  file: File;
  type: string;
  status: Status;
  progress: number;
  error?: string;
}

const CONCURRENCY = 2;
const ATTEMPTS = 3;

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

function put(url: string, body: Blob, type: string, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Connection lost'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    xhr.send(body);
  });
}

/** Downscaled JPEG for galleries, or null if this browser can't decode the photo (e.g. HEIC outside Safari). */
async function makePreview(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    // Drawing straight to a small canvas keeps under iOS's canvas size limit.
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (${res.status})`);
  return data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Uploader({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const running = useRef(new Set<string>());
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const base = `/album/${slug}/api/uploads`;

  const update = useCallback((key: string, patch: Partial<Item>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }, []);

  const process = useCallback(
    async (item: Item) => {
      const isPhoto = item.type.startsWith('image/');
      update(item.key, { status: 'uploading', progress: 0, error: undefined });
      try {
        let urls = await api<{ id: string; uploadUrl: string; previewUrl: string | null }>(base, {
          name: item.file.name, type: item.type, size: item.file.size, preview: isPhoto,
          lastModified: item.file.lastModified, client: await collectClientInfo().catch(() => null),
        });
        const id = urls.id;
        // Make the preview while the original is already uploading.
        const preview = isPhoto ? makePreview(item.file) : Promise.resolve(null);

        for (let attempt = 1; ; attempt++) {
          try {
            await put(urls.uploadUrl, item.file, item.type, (p) => update(item.key, { progress: p }));
            break;
          } catch (err) {
            if (attempt >= ATTEMPTS) throw err;
            update(item.key, { progress: 0, error: `Retrying (${attempt + 1} of ${ATTEMPTS})…` });
            await sleep(2000 * attempt);
            urls = { id, ...(await api<{ uploadUrl: string; previewUrl: string | null }>(`${base}/${id}`, { action: 'url' })) };
          }
        }

        update(item.key, { status: 'finishing', progress: 1, error: undefined });
        const blob = await preview;
        if (blob && urls.previewUrl) await put(urls.previewUrl, blob, 'image/jpeg').catch(() => {});
        await api(`${base}/${id}`, { action: 'complete' });
        update(item.key, { status: 'done' });
      } catch (err) {
        update(item.key, { status: 'failed', error: (err as Error).message });
      }
    },
    [base, update],
  );

  // Start queued items, two at a time.
  useEffect(() => {
    const active = items.filter((i) => i.status === 'uploading' || i.status === 'finishing').length;
    const next = items.filter((i) => i.status === 'queued' && !running.current.has(i.key)).slice(0, Math.max(0, CONCURRENCY - active));
    for (const item of next) {
      running.current.add(item.key);
      process(item).finally(() => running.current.delete(item.key));
    }
  }, [items, process]);

  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'finishing');
  const doneCount = items.filter((i) => i.status === 'done').length;

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
    const added: Item[] = Array.from(files).map((file, i) => {
      const type = fileType(file);
      const problem = uploadProblem({ type, size: file.size });
      return { key: `${Date.now()}-${i}-${file.name}`, file, type, status: problem ? 'rejected' : 'queued', progress: 0, error: problem ?? undefined };
    });
    setItems((xs) => [...added, ...xs]);
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
          Keep this page open until your uploads finish
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{it.file.name || 'Photo'} <span className="text-stone-500">{formatBytes(it.file.size)}</span></span>
                <span className="shrink-0 text-stone-600">
                  {it.status === 'queued' && 'Waiting'}
                  {it.status === 'uploading' && `${Math.round(it.progress * 100)}%`}
                  {it.status === 'finishing' && 'Finishing'}
                  {it.status === 'done' && <span className="text-green-700">Added ✓</span>}
                  {(it.status === 'failed' || it.status === 'rejected') && <span className="text-red-600">Not added</span>}
                </span>
              </div>
              {(it.status === 'uploading' || it.status === 'finishing') && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(it.progress * 100)}%` }} />
                </div>
              )}
              {it.error && <p className={`mt-1 ${it.status === 'uploading' ? 'text-stone-500' : 'text-red-600'}`}>{it.error}</p>}
              {it.status === 'failed' && (
                <button type="button" className="mt-2 text-brand underline" onClick={() => update(it.key, { status: 'queued', error: undefined, progress: 0 })}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
