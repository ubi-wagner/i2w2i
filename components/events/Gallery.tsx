'use client';

import { useEffect, useState } from 'react';
import type { GalleryItem } from '@/lib/events/queries';

interface Props {
  items: GalleryItem[];
  empty: string;
  /** Owners/curators: hide, feature, delete. */
  moderation?: { eventId: string; action: (form: FormData) => Promise<void> };
}

export function Gallery({ items, empty, moderation }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const item = open === null ? null : items[open];

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

  if (!items.length) return <p className="text-stone-600">{empty}</p>;

  return (
    <>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
        {items.map((it, i) => (
          <li key={it.id} className={`relative ${it.hidden ? 'opacity-40' : ''}`}>
            <button type="button" onClick={() => setOpen(i)} className="block aspect-square w-full overflow-hidden rounded-md bg-stone-200" aria-label={`Open ${it.kind} from ${it.uploaderName}`}>
              {it.kind === 'photo' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.src} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="relative block h-full w-full">
                  <video src={`${it.src}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow">▶</span>
                </span>
              )}
            </button>
            {it.featured && <span className="absolute left-1 top-1 rounded bg-brand px-1 text-xs text-white">★</span>}
            {it.hidden && <span className="absolute right-1 top-1 rounded bg-stone-800 px-1 text-xs text-white">Hidden</span>}
          </li>
        ))}
      </ul>

      {item && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between gap-2 p-3 text-sm">
            <span>{item.uploaderName} · {new Date(item.createdAt).toLocaleString()}</span>
            <button type="button" onClick={() => setOpen(null)} className="rounded px-3 py-1 text-lg" aria-label="Close">✕</button>
          </div>
          <div className="flex min-h-0 grow items-center justify-center px-2" onClick={() => setOpen(null)}>
            {item.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.src} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            ) : (
              <video src={item.src} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
          {item.details && item.details.length > 0 && (
            <details className="mx-auto w-full max-w-xl px-4 text-sm">
              <summary className="cursor-pointer text-center text-stone-300">Details</summary>
              <dl className="mt-2 grid max-h-48 grid-cols-[auto_1fr] gap-x-3 gap-y-1 overflow-y-auto rounded-lg bg-white/10 p-3">
                {item.details.map((d) => (
                  <div key={d.label} className="contents">
                    <dt className="text-stone-400">{d.label}</dt>
                    <dd className="break-words">{d.href ? <a href={d.href} target="_blank" rel="noreferrer" className="underline">{d.value}</a> : d.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          <div className="flex flex-wrap items-center justify-center gap-4 p-3 text-sm">
            <button type="button" disabled={open === 0} onClick={() => setOpen((i) => (i ?? 1) - 1)} className="px-2 disabled:opacity-30">← Prev</button>
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
                    <input type="hidden" name="event_id" value={moderation.eventId} />
                    <input type="hidden" name="upload_id" value={item.id} />
                    <input type="hidden" name="action" value={action} />
                    <button className={action === 'delete' ? 'text-red-300 underline' : 'underline'}>{label}</button>
                  </form>
                ))}
              </>
            )}
            <button type="button" disabled={open === items.length - 1} onClick={() => setOpen((i) => (i ?? 0) + 1)} className="px-2 disabled:opacity-30">Next →</button>
          </div>
        </div>
      )}
    </>
  );
}
