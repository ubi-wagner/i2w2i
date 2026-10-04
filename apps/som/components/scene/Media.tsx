'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { fileUrl, forget, mediaMeta, saveToDevice, thumbUrl, type MediaRow } from '@/lib/client/media';
import type { MediaMeta } from '@/lib/client/upload';
import { usePod } from '../Pod';
import { ErrorText, Sheet } from '../ui';

const ICON = { photo: '📷', video: '🎥', audio: '🎙️', file: '📎' } as const;

function duration(s?: number) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A thumbnail tile; tapping opens the decrypted file. */
export function MediaTile({ m, onDeleted }: { m: MediaRow; onDeleted?: () => void }) {
  const pod = usePod();
  const [thumb, setThumb] = useState<string | null>(null);
  const [meta, setMeta] = useState<MediaMeta | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (m.status !== 'ready') return;
    let live = true;
    void mediaMeta(m, pod.key).then((x) => live && setMeta(x)).catch(() => {});
    void thumbUrl(m, pod.key).then((u) => live && setThumb(u)).catch(() => {});
    return () => { live = false; };
  }, [m, pod.key]);
  const kind = meta?.kind ?? 'file';
  if (m.status !== 'ready') return <div className="flex aspect-square items-center justify-center rounded-xl bg-paper-sunk text-xs text-ink-soft">Uploading…</div>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${kind}`} className="relative block aspect-square overflow-hidden rounded-xl border border-line bg-paper-sunk">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
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
        {url && meta?.kind === 'file' && <span className="p-8 text-white">{meta.name}</span>}
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

export function MediaGrid({ items, onChange }: { items: MediaRow[]; onChange?: () => void }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((m) => <MediaTile key={m.id} m={m} onDeleted={onChange} />)}
    </div>
  );
}
