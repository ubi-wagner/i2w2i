'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { fileUrl, forget, mediaMeta, saveToDevice, thumbUrl, type MediaRow } from '@/lib/client/media';
import type { MediaMeta } from '@/lib/client/upload';
import { useAnyUploading } from '@/lib/client/uploads';
import { usePod } from '../Pod';
import { ErrorText, Sheet } from '../ui';

const ICON = { photo: '📷', video: '🎥', audio: '🎙️', file: '📎' } as const;

function duration(s?: number) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function size(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A thumbnail tile; tapping opens the decrypted file. */
export function MediaTile({ m, onDeleted }: { m: MediaRow; onDeleted?: () => void }) {
  const pod = usePod();
  const [thumb, setThumb] = useState<string | null>(null);
  const [meta, setMeta] = useState<MediaMeta | null>(null);
  const [broken, setBroken] = useState(false); // couldn't be opened here: shown as a file, which says why when opened
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (m.status !== 'ready') return;
    let live = true;
    void mediaMeta(m, pod.key).then((x) => live && setMeta(x)).catch(() => live && setBroken(true));
    void thumbUrl(m, pod.key).then((u) => live && setThumb(u)).catch(() => {});
    return () => { live = false; };
  }, [m, pod.key]);
  const kind = meta?.kind ?? 'file';
  if (m.status !== 'ready') return <Unfinished m={m} onDeleted={onDeleted} />;
  // Until its details are decrypted, it isn't anything yet (not a "file").
  if (!meta && !broken) return <span className="block aspect-square animate-pulse rounded-xl border border-line bg-paper-sunk" role="status" aria-label="Opening…" />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${kind}`} className="relative block aspect-square overflow-hidden rounded-xl border border-line bg-paper-sunk">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : kind === 'file' && meta ? (
          // A file is known by its name.
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5">
            <span className="text-3xl">{ICON.file}</span>
            <span className="line-clamp-2 break-all text-center text-[11px] leading-tight text-ink-soft">{meta.name}</span>
          </span>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl">{ICON[kind]}</span>
        )}
        {(kind === 'video' || kind === 'audio') && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{kind === 'video' ? '▶ ' : ''}{duration(meta?.duration)}</span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={meta?.kind === 'audio' ? 'Voice note' : meta?.kind === 'video' ? 'Video' : meta?.kind === 'photo' ? 'Photo' : 'File'} wide>
        <Viewer m={m} meta={meta} mine={m.uploader_id === pod.account.id} onDeleted={() => { setOpen(false); onDeleted?.(); }} />
      </Sheet>
    </>
  );
}

function Viewer({ m, meta, mine, onDeleted }: { m: MediaRow; meta: MediaMeta | null; mine: boolean; onDeleted: () => void }) {
  const pod = usePod();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void fileUrl(m, pod.key).then((u) => live && setUrl(u)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [m, pod.key]);
  async function remove() {
    if (!confirm('Delete this for both of you? It can’t be undone.')) return;
    try {
      await api(`/api/media/${m.id}`, { method: 'DELETE' });
      forget(m.id);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-2xl bg-black">
        {!url && !error && <span className="py-16 text-sm text-white/70">Decrypting…</span>}
        {url && meta?.kind === 'photo' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-[65dvh] w-auto object-contain" />
        )}
        {url && meta?.kind === 'video' && <video src={url} controls playsInline className="max-h-[65dvh] w-full" />}
        {url && meta?.kind === 'audio' && <audio src={url} controls className="m-6 w-full" />}
        {url && meta?.kind === 'file' && (
          <span className="space-y-1 p-8 text-center text-white">
            <span className="block text-4xl">{ICON.file}</span>
            <span className="block break-all">{meta.name}</span>
            <span className="block text-sm text-white/70">{size(meta.size)}</span>
          </span>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className="btn-quiet" disabled={!url} onClick={() => saveToDevice(m, pod.key).catch((e) => setError((e as Error).message))}>Save to phone</button>
        {mine && <button type="button" className="btn-quiet text-stop" onClick={remove}>Delete</button>}
      </div>
      <p className="text-xs text-ink-soft">From {pod.nameOf(m.uploader_id)}. Decrypted on this phone only.</p>
    </div>
  );
}

/**
 * An upload that hasn't finished: still going on this phone, or stopped
 * (the app was closed, the connection dropped). Whoever sent it can clear a
 * stopped one and send it again.
 */
function Unfinished({ m, onDeleted }: { m: MediaRow; onDeleted?: () => void }) {
  const pod = usePod();
  const [error, setError] = useState('');
  const mine = m.uploader_id === pod.account.id;
  const sendingHere = useAnyUploading();
  const stale = !sendingHere && Date.now() - new Date(m.created_at).getTime() > 2 * 60_000;
  async function remove() {
    try {
      await api(`/api/media/${m.id}`, { method: 'DELETE' });
      onDeleted?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-paper-sunk p-1 text-center text-xs text-ink-soft">
      <span>{mine && stale ? 'Didn’t finish' : 'Uploading…'}</span>
      {mine && stale && <button type="button" className="underline" onClick={remove}>Remove</button>}
      {error && <span className="text-stop">{error}</span>}
    </div>
  );
}

export function MediaGrid({ items, onChange }: { items: MediaRow[]; onChange?: () => void }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((m) => <MediaTile key={m.id} m={m} onDeleted={onChange} />)}
    </div>
  );
}
