'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryItem } from '@/lib/events/queries';
import { FullScreen } from '@/components/FullScreen';
import { Comments } from './Comments';
import { FramedVideo } from './FramedVideo';
import type { Overlay } from '@/lib/events/overlay';

const framed = (o: Record<string, unknown> | null | undefined) => typeof o?.frame === 'string' && o.frame !== 'none';

interface Props {
  items: GalleryItem[];
  empty: string;
  /** Enables Select + "Download selected" (a zip, streamed by the server). */
  downloadUrl?: string;
  /** Owners/curators: hide, star, delete, one at a time or in bulk. */
  moderation?: {
    eventId: string;
    action: (form: FormData) => Promise<void>;
    bulkAction?: (form: FormData) => Promise<void>;
  };
  /** Album slug: shows comments in the lightbox. */
  commentsSlug?: string;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function Gallery({ items, empty, downloadUrl, moderation, commentsSlug }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const downloadForm = useRef<HTMLFormElement>(null);
  const item = open === null ? null : items[open];

  // Forget selections of items that went away (deleted, hidden elsewhere).
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => items.some((i) => i.id === id))));
  }, [items]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : Math.min(items.length - 1, i + 1)));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items.length]);

  const days = useMemo(() => {
    const groups: { day: string; label: string; items: { item: GalleryItem; index: number }[] }[] = [];
    items.forEach((it, index) => {
      const day = new Date(it.createdAt).toDateString();
      let g = groups.find((x) => x.day === day);
      if (!g) groups.push((g = { day, label: dayLabel(it.createdAt), items: [] }));
      g.items.push({ item: it, index });
    });
    return groups;
  }, [items]);

  const people = useMemo(() => [...new Set(items.map((i) => i.uploaderName))].sort(), [items]);

  if (!items.length) return <p className="text-stone-600">{empty}</p>;

  const canSelect = Boolean(downloadUrl || moderation?.bulkAction);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const addAll = (ids: string[]) =>
    setSelected((s) => {
      const allIn = ids.every((id) => s.has(id));
      const n = new Set(s);
      for (const id of ids) {
        if (allIn) n.delete(id);
        else n.add(id);
      }
      return n;
    });

  async function bulk(action: string) {
    if (!moderation?.bulkAction || !selected.size) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} item${selected.size > 1 ? 's' : ''} for good?`)) return;
    setBusy(true);
    const f = new FormData();
    f.set('event_id', moderation.eventId);
    f.set('action', action);
    for (const id of selected) f.append('upload_id', id);
    try {
      await moderation.bulkAction(f);
      if (action === 'delete') setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {canSelect && (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-stone-50/95 p-1 text-sm backdrop-blur">
          {!selecting ? (
            <button type="button" className="btn-secondary py-1" onClick={() => setSelecting(true)}>Select</button>
          ) : (
            <>
              <span className="font-medium" aria-live="polite">{selected.size} selected</span>
              <button type="button" className="btn-secondary py-1" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>All</button>
              <button type="button" className="btn-secondary py-1" onClick={() => setSelected(new Set())}>None</button>
              {people.length > 1 && (
                <select
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1"
                  value=""
                  onChange={(e) => e.target.value && addAll(items.filter((i) => i.uploaderName === e.target.value).map((i) => i.id))}
                  aria-label="Select everything from one person"
                >
                  <option value="">From person…</option>
                  {people.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {downloadUrl && (
                <button type="button" className="btn py-1" disabled={!selected.size} onClick={() => downloadForm.current?.submit()}>
                  Download{selected.size ? ` (${selected.size})` : ''}
                </button>
              )}
              {moderation?.bulkAction && (
                <>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('hide')}>Hide</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('show')}>Show</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('feature')}>Star</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('unfeature')}>Unstar</button>
                  <button type="button" className="btn-secondary py-1 text-red-700" disabled={busy || !selected.size} onClick={() => bulk('delete')}>Delete</button>
                </>
              )}
              <button type="button" className="ml-auto px-2 py-1 text-stone-600 underline" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Done</button>
            </>
          )}
          {downloadUrl && (
            <form ref={downloadForm} method="post" action={downloadUrl} className="hidden">
              {[...selected].map((id) => <input key={id} type="hidden" name="id" value={id} />)}
            </form>
          )}
        </div>
      )}

      {days.map((g) => (
        <section key={g.day} className="space-y-1">
          {(days.length > 1 || selecting) && (
            <div className="flex items-center justify-between text-sm text-stone-600">
              <h3>{g.label}</h3>
              {selecting && (
                <button type="button" className="text-brand underline" onClick={() => addAll(g.items.map((x) => x.item.id))}>
                  {g.items.every((x) => selected.has(x.item.id)) ? 'Unselect day' : 'Select day'}
                </button>
              )}
            </div>
          )}
          <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
            {g.items.map(({ item: it, index: i }) => {
              const isSel = selected.has(it.id);
              return (
                <li key={it.id} className={`relative ${it.hidden ? 'opacity-40' : ''}`}>
                  <button
                    type="button"
                    onClick={() => (selecting ? toggle(it.id) : setOpen(i))}
                    className={`block aspect-square w-full overflow-hidden rounded-md bg-stone-200 ${isSel ? 'ring-4 ring-brand ring-offset-1' : ''}`}
                    aria-label={`${selecting ? (isSel ? 'Unselect' : 'Select') : 'Open'} ${it.kind} from ${it.uploaderName}`}
                    aria-pressed={selecting ? isSel : undefined}
                  >
                    {it.kind === 'photo' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.src}
                        alt={it.caption || ''}
                        loading="lazy"
                        // A frame is part of the picture: show all of it rather than cropping it off.
                        className={`h-full w-full ${framed(it.overlay) ? 'bg-stone-100 object-contain' : 'object-cover'}`}
                      />
                    ) : (
                      <span className="relative block h-full w-full">
                        {it.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <video src={`${it.src}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow">▶</span>
                      </span>
                    )}
                  </button>
                  {selecting && (
                    <span className={`pointer-events-none absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-sm text-white shadow ${isSel ? 'bg-brand' : 'bg-black/30'}`}>
                      {isSel ? '✓' : ''}
                    </span>
                  )}
                  {it.featured && <span className="absolute left-1 top-1 rounded bg-brand px-1 text-xs text-white">★</span>}
                  {it.hidden && !selecting && <span className="absolute right-1 top-1 rounded bg-stone-800 px-1 text-xs text-white">Hidden</span>}
                  {it.comments > 0 && !selecting && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">💬 {it.comments}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {item && (
        <FullScreen label={`${item.kind === 'photo' ? 'Photo' : 'Video'} from ${item.uploaderName}`}>
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm">
            <span className="truncate">
              {item.uploaderName} · {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <button type="button" onClick={() => setOpen(null)} className="rounded px-3 py-1 text-lg" aria-label="Close">✕</button>
          </div>
          <div className="flex min-h-0 grow items-center justify-center px-2" onClick={() => setOpen(null)}>
            {item.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.src} alt={item.caption || ''} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            ) : (
              <FramedVideo src={item.src} poster={item.poster} overlay={item.overlay as Overlay | null} className="max-h-[60vh] max-w-full" />
            )}
          </div>
          <div className="max-h-[45vh] shrink-0 space-y-2 overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-2">
            {/* A framed caption is already drawn on the picture. */}
            {item.caption && !item.overlay?.caption && <p className="px-4 text-center">{item.caption}</p>}
            {item.details && item.details.length > 0 && (
              <details className="mx-auto w-full max-w-xl px-4 text-sm">
                <summary className="cursor-pointer text-center text-stone-300">Details</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-white/10 p-3">
                  {item.details.map((d) => (
                    <div key={d.label} className="contents">
                      <dt className="text-stone-400">{d.label}</dt>
                      <dd className="break-words">{d.href ? <a href={d.href} target="_blank" rel="noreferrer" className="underline">{d.value}</a> : d.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {commentsSlug && <Comments slug={commentsSlug} uploadId={item.id} />}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-3 pb-3 text-sm">
              <button type="button" disabled={open === 0} onClick={() => setOpen((i) => (i ?? 1) - 1)} className="px-2 py-1 disabled:opacity-30">← Prev</button>
              {item.originalUrl && <a href={item.originalUrl} className="underline">Download original</a>}
              {moderation && (
                <>
                  {[
                    [item.hidden ? 'show' : 'hide', item.hidden ? 'Show' : 'Hide'],
                    [item.featured ? 'unfeature' : 'feature', item.featured ? 'Unstar' : 'Star'],
                    ['delete', 'Delete'],
                  ].map(([action, label]) => (
                    <form
                      key={action}
                      action={async (f) => {
                        if (action === 'delete' && !confirm('Delete this for good?')) return;
                        await moderation.action(f);
                        setOpen(null);
                      }}
                    >
                      <input type="hidden" hidden name="event_id" value={moderation.eventId} />
                      <input type="hidden" hidden name="upload_id" value={item.id} />
                      <input type="hidden" hidden name="action" value={action} />
                      <button className={action === 'delete' ? 'text-red-300 underline' : 'underline'}>{label}</button>
                    </form>
                  ))}
                </>
              )}
              <button type="button" disabled={open === items.length - 1} onClick={() => setOpen((i) => (i ?? 0) + 1)} className="px-2 py-1 disabled:opacity-30">Next →</button>
            </div>
          </div>
        </FullScreen>
      )}
    </div>
  );
}
