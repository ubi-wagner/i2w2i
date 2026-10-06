'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryItem } from '@/lib/events/queries';
import { FullScreen } from '@/components/FullScreen';
import { Comments } from './Comments';
import { FramedVideo } from './FramedVideo';
import type { Overlay } from '@/lib/events/overlay';

const framed = (o: Record<string, unknown> | null | undefined) => typeof o?.frame === 'string' && o.frame !== 'none';

type Result = { error?: string; message?: string; id?: string };

/** Hosts and editors: the event's albums, and filing photos into them. */
export interface AlbumTools {
  eventId: string;
  list: { id: string; title: string; published: boolean }[];
  /** Approve a waiting photo and post it into albums, in one go. */
  approveInto: (input: { eventId: string; uploadId: string; albumIds: string[] }) => Promise<Result>;
  fileInto: (input: { eventId: string; albumId: string; uploadIds: string[]; add: boolean }) => Promise<Result>;
  create: (input: { eventId: string; title: string }) => Promise<Result>;
  /** On one album's page: "Take out of this album" and "Use as cover". */
  current?: { id: string; title: string; setCover: (input: { eventId: string; albumId: string; uploadId: string }) => Promise<Result> };
  /** Picking photos for one album: Select gives a single "Add to …" button. */
  target?: { id: string; title: string };
}

interface Props {
  items: GalleryItem[];
  empty: string;
  /** Enables Select + "Download selected" (a zip, streamed by the server). */
  downloadUrl?: string;
  /** Owners/curators: approve, hide, star, delete, one at a time or in bulk. */
  moderation?: {
    eventId: string;
    action: (form: FormData) => Promise<void>;
    bulkAction?: (form: FormData) => Promise<void>;
  };
  /** Owners/curators: post photos into the event's albums. */
  albums?: AlbumTools;
  /** Album slug: shows comments in the lightbox. */
  commentsSlug?: string;
  /** Items leave this list once approved (the review queue): stay put after approving. */
  reviewQueue?: boolean;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** The time, ticking every few seconds (for "can be approved in…"). */
function useNow(every = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Milliseconds until a waiting item can be approved (0: now). */
const waitMs = (it: GalleryItem, now: number) => (it.reviewableAt ? Math.max(0, new Date(it.reviewableAt).getTime() - now) : 0);
const clockLeft = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function Gallery({ items, empty, downloadUrl, moderation, albums, commentsSlug, reviewQueue = false }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  // The list can shrink under an open photo (approved out of the review queue, deleted).
  useEffect(() => {
    if (open !== null && open >= items.length) setOpen(items.length ? items.length - 1 : null);
  }, [open, items.length]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Result>({});
  const downloadForm = useRef<HTMLFormElement>(null);
  // Where a swipe on the open photo started.
  const swipe = useRef<number | null>(null);
  const now = useNow();
  const item = open === null ? null : items[open];

  // Albums chosen for each waiting photo before it's approved.
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  // Album changes show at once; the next page load confirms them.
  const [inAlbums, setInAlbums] = useState<Record<string, string[]>>({});
  useEffect(() => setInAlbums({}), [items]);
  const albumsOf = (it: GalleryItem) => inAlbums[it.id] ?? it.albums ?? [];

  // Forget selections of items that went away (deleted, hidden elsewhere).
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => items.some((i) => i.id === id))));
  }, [items]);
  useEffect(() => setNote({}), [open]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
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

  // A list emptied by the last action (all filed, all approved) still says what happened.
  if (!items.length) {
    return (
      <div className="space-y-1">
        {note.message && <p className="text-sm text-green-800" role="status">{note.message}</p>}
        <p className="text-stone-600">{empty}</p>
      </div>
    );
  }

  const canSelect = Boolean(downloadUrl || moderation?.bulkAction || albums?.target);
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

  async function bulkFile(albumId: string, add: boolean) {
    if (!albums || !albumId || !selected.size) return;
    setBusy(true);
    try {
      setNote(await albums.fileInto({ eventId: albums.eventId, albumId, uploadIds: [...selected], add }));
    } finally {
      setBusy(false);
    }
  }

  /** A new album from the photo view, ready to post into. */
  async function newAlbum(title: string): Promise<string | null> {
    if (!albums) return null;
    const r = await albums.create({ eventId: albums.eventId, title });
    setNote(r.id ? { message: `Made “${title}”: a draft until you publish it on the Albums tab.` } : r);
    return r.id ?? null;
  }

  async function toggleAlbum(it: GalleryItem, albumId: string) {
    if (!albums) return;
    const has = albumsOf(it).includes(albumId);
    setInAlbums((m) => ({ ...m, [it.id]: has ? albumsOf(it).filter((a) => a !== albumId) : [...albumsOf(it), albumId] }));
    const r = await albums.fileInto({ eventId: albums.eventId, albumId, uploadIds: [it.id], add: !has });
    setNote(r.error ? r : { message: has ? 'Taken out of the album.' : 'Posted to the album.' });
  }

  async function approve(it: GalleryItem) {
    if (!albums) return;
    setBusy(true);
    try {
      const r = await albums.approveInto({ eventId: albums.eventId, uploadId: it.id, albumIds: chosen[it.id] ?? [] });
      setNote(r);
      if (r.error) return;
      // On to the next one, for quick review. In the review queue the approved
      // one leaves the list, so the next one slides into this place.
      if (!reviewQueue && open !== null && open < items.length - 1) setOpen(open + 1);
    } finally {
      setBusy(false);
    }
  }

  const listed = albums?.list ?? [];
  const albumName = (id: string) => listed.find((a) => a.id === id)?.title ?? 'Album';

  return (
    <div className="space-y-3">
      {canSelect && (
        <div className="sticky top-12 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl bg-stone-50/95 p-1 text-sm backdrop-blur">
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
                  <button type="button" className="btn-secondary border-green-700 py-1 text-green-800" disabled={busy || !selected.size} onClick={() => bulk('approve')}>Approve</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('hide')}>Hide</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('show')}>Show</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('feature')}>Star</button>
                  <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => bulk('unfeature')}>Unstar</button>
                  <button type="button" className="btn-secondary py-1 text-red-700" disabled={busy || !selected.size} onClick={() => bulk('delete')}>Delete</button>
                </>
              )}
              {albums?.target && (
                <button type="button" className="btn py-1" disabled={busy || !selected.size} onClick={() => void bulkFile(albums.target!.id, true)}>
                  Add {selected.size || ''} to “{albums.target.title}”
                </button>
              )}
              {albums && !albums.target && listed.length > 0 && (
                <select
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1"
                  value=""
                  disabled={busy || !selected.size}
                  aria-label="Add the selected to an album"
                  onChange={(e) => void bulkFile(e.target.value, true)}
                >
                  <option value="">Add to album…</option>
                  {listed.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              )}
              {albums?.current && (
                <button type="button" className="btn-secondary py-1" disabled={busy || !selected.size} onClick={() => void bulkFile(albums.current!.id, false)}>Take out of this album</button>
              )}
              <button type="button" className="ml-auto px-2 py-1 text-stone-600 underline" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Done</button>
            </>
          )}
          {note.error && !item && <span className="w-full text-red-700" role="alert">{note.error}</span>}
          {note.message && !item && <span className="w-full text-green-800" role="status">{note.message}</span>}
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
              const wait = waitMs(it, now);
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
                  {it.pending && (
                    <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-amber-400 px-1 text-xs font-medium text-amber-950">
                      {moderation ? (wait ? `OK in ${Math.ceil(wait / 60_000)} min` : 'Needs OK') : 'Waiting'}
                    </span>
                  )}
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
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.uploaderName}</p>
              <p className="truncate text-xs text-white/60">
                {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                {open !== null && <> · {open + 1} of {items.length}</>}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20" aria-label="Close">✕</button>
          </div>
          <div
            className="relative flex min-h-0 grow items-center justify-center px-2"
            onClick={() => setOpen(null)}
            onTouchStart={(e) => { swipe.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
              const from = swipe.current;
              const to = e.changedTouches[0]?.clientX;
              swipe.current = null;
              if (from === null || to === undefined || Math.abs(to - from) < 50) return;
              setOpen((i) => (i === null ? i : Math.min(items.length - 1, Math.max(0, i + (to < from ? 1 : -1)))));
            }}
          >
            {item.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.src} alt={item.caption || ''} className="max-h-full max-w-full rounded-sm object-contain" onClick={(e) => e.stopPropagation()} />
            ) : (
              <FramedVideo src={item.src} poster={item.poster} overlay={item.overlay as Overlay | null} className="max-h-[60vh] max-w-full" />
            )}
            {open !== null && open > 0 && (
              <button type="button" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i ?? 1) - 1); }}
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
                <Glyph name="left" />
              </button>
            )}
            {open !== null && open < items.length - 1 && (
              <button type="button" aria-label="Next" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i ?? 0) + 1); }}
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
                <Glyph name="right" />
              </button>
            )}
          </div>
          <div className="max-h-[50vh] shrink-0 space-y-2 overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-2">
            {/* A framed caption is already drawn on the picture. */}
            {item.caption && !item.overlay?.caption && <p className="px-4 text-center">{item.caption}</p>}

            {moderation && item.pending && !item.hidden && (
              <ReviewPanel
                item={item}
                wait={waitMs(item, now)}
                albums={albums}
                chosen={chosen[item.id] ?? []}
                setChosen={(ids) => setChosen((c) => ({ ...c, [item.id]: ids }))}
                newAlbum={newAlbum}
                busy={busy}
                onApprove={() => void approve(item)}
              />
            )}
            {albums && !item.pending && (
              <div className="mx-auto w-full max-w-xl px-4 text-sm" role="group" aria-label="Albums">
                <p className="mb-1 text-center text-stone-300">{listed.length ? 'In albums (tap to add or take out)' : 'Post it to an album, like “Ceremony”:'}</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {listed.map((a) => {
                    const on = albumsOf(item).includes(a.id);
                    return (
                      <button key={a.id} type="button" aria-pressed={on} onClick={() => void toggleAlbum(item, a.id)}
                        className={`rounded-full border px-3 py-1 ${on ? 'border-green-400 bg-green-600 text-white' : 'border-white/40 text-white'}`}>
                        {on ? '✓ ' : '+ '}{a.title}{a.published ? '' : ' (draft)'}
                      </button>
                    );
                  })}
                  <NewAlbumChip onMake={async (title) => {
                    const id = await newAlbum(title);
                    if (id) {
                      setInAlbums((m) => ({ ...m, [item.id]: [...albumsOf(item), id] }));
                      await albums.fileInto({ eventId: albums.eventId, albumId: id, uploadIds: [item.id], add: true });
                    }
                  }} />
                </div>
              </div>
            )}
            {(note.error || note.message) && (
              <p className={`px-4 text-center text-sm ${note.error ? 'text-red-300' : 'text-green-300'}`} role={note.error ? 'alert' : 'status'}>{note.error ?? note.message}</p>
            )}

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
            {item.pending && !moderation && (
              <p className="px-4 text-center text-sm text-amber-200">Only you and the hosts can see this until they add it to the album.</p>
            )}
            {commentsSlug && <Comments slug={commentsSlug} uploadId={item.id} />}
            <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-3">
              {item.originalUrl && <a href={item.originalUrl} className="viewer-btn"><Glyph name="download" />Download original</a>}
              {albums?.current && !item.pending && (
                <>
                  <button type="button" className="viewer-btn" onClick={async () => setNote(await albums.current!.setCover({ eventId: albums.eventId, albumId: albums.current!.id, uploadId: item.id }))}><Glyph name="cover" />Use as album cover</button>
                  <button type="button" className="viewer-btn" onClick={async () => { setNote(await albums.fileInto({ eventId: albums.eventId, albumId: albums.current!.id, uploadIds: [item.id], add: false })); }}><Glyph name="out" />Take out of this album</button>
                </>
              )}
              {moderation && (
                <>
                  {/* Without album tools, waiting photos are approved here. */}
                  {!albums && item.pending && !waitMs(item, now) && <ModForm moderation={moderation} id={item.id} action="approve" label="Approve ✓" onDone={() => { if (!reviewQueue && open !== null && open < items.length - 1) setOpen(open + 1); }} />}
                  <ModForm moderation={moderation} id={item.id} action={item.hidden ? 'show' : 'hide'} label={item.hidden ? 'Show' : 'Hide'} />
                  <ModForm moderation={moderation} id={item.id} action={item.featured ? 'unfeature' : 'feature'} label={item.featured ? 'Unstar' : 'Star'} />
                  <ModForm moderation={moderation} id={item.id} action="delete" label="Delete" />
                </>
              )}
            </div>
          </div>
        </FullScreen>
      )}
    </div>
  );
}

/** One moderation button (hide, star, delete…) for the photo being viewed; the view stays open. */
function ModForm({ moderation, id, action, label, onDone }: { moderation: NonNullable<Props['moderation']>; id: string; action: string; label: string; onDone?: () => void }) {
  return (
    <form
      action={async (f) => {
        if (action === 'delete' && !confirm('Delete this for good?')) return;
        await moderation.action(f);
        onDone?.();
      }}
    >
      <input type="hidden" hidden name="event_id" value={moderation.eventId} />
      <input type="hidden" hidden name="upload_id" value={id} />
      <input type="hidden" hidden name="action" value={action} />
      <button className={action === 'delete' ? 'viewer-btn text-red-300 hover:bg-red-500/20' : action === 'approve' ? 'viewer-btn bg-green-600 font-medium hover:bg-green-500' : 'viewer-btn'}>
        <Glyph name={({ hide: 'hide', show: 'show', feature: 'star', unfeature: 'star', delete: 'trash' } as Record<string, GlyphName>)[action] ?? 'check'} />
        {label}
      </button>
    </form>
  );
}

/**
 * A photo waiting for a host's OK, in the photo view: pick the albums it
 * goes in, then approve. Hiding or deleting it is below with the others.
 */
function ReviewPanel({ item, wait, albums, chosen, setChosen, newAlbum, busy, onApprove }: {
  item: GalleryItem; wait: number; albums?: AlbumTools; chosen: string[]; setChosen: (ids: string[]) => void;
  newAlbum: (title: string) => Promise<string | null>; busy: boolean; onApprove: () => void;
}) {
  void item;
  return (
    <section aria-label="Waiting for your OK" className="mx-auto w-full max-w-xl space-y-2 rounded-xl border border-amber-300/60 bg-amber-400/15 px-4 py-3 text-sm">
      <p className="text-center font-medium text-amber-200">
        Waiting for your OK{wait ? `: can be approved in ${clockLeft(wait)} (the guest’s phone may still be finishing it)` : ''}
      </p>
      {albums && (
        <div className="space-y-1">
          <p className="text-center text-stone-300">{albums.list.length ? 'Post it to (optional):' : 'Albums let guests browse by part of the day.'}</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {albums.list.map((a) => {
              const on = chosen.includes(a.id);
              return (
                <button key={a.id} type="button" aria-pressed={on} onClick={() => setChosen(on ? chosen.filter((x) => x !== a.id) : [...chosen, a.id])}
                  className={`rounded-full border px-3 py-1 ${on ? 'border-green-400 bg-green-600 text-white' : 'border-white/40 text-white'}`}>
                  {on ? '✓ ' : ''}{a.title}
                </button>
              );
            })}
            <NewAlbumChip onMake={async (title) => { const id = await newAlbum(title); if (id) setChosen([...chosen, id]); }} />
          </div>
        </div>
      )}
      {albums && (
        <div className="text-center">
          <button type="button" disabled={busy || wait > 0} onClick={onApprove}
            className="rounded-full bg-green-600 px-5 py-2 font-semibold text-white disabled:opacity-40">
            {chosen.length ? `Approve & post to ${chosen.length === 1 ? 'the album' : `${chosen.length} albums`}` : 'Approve ✓'}
          </button>
        </div>
      )}
    </section>
  );
}

/** “+ New album”: a name box right where you are, no pop-up. */
function NewAlbumChip({ onMake }: { onMake: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" className="rounded-full border border-dashed border-white/40 px-3 py-1 text-white" onClick={() => setOpen(true)}>
        + New album
      </button>
    );
  }
  return (
    <form
      className="flex w-full max-w-sm items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        const name = title.trim();
        if (!name) return;
        setBusy(true);
        try {
          await onMake(name);
          setOpen(false);
          setTitle('');
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        aria-label="New album name"
        placeholder="Album name, like Ceremony"
        value={title}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        className="min-w-0 flex-1 rounded-full border border-white/40 bg-black/40 px-3 py-1 text-white placeholder:text-stone-400"
      />
      <button className="rounded-full bg-white px-3 py-1 font-medium text-stone-900 disabled:opacity-50" disabled={busy || !title.trim()}>Make</button>
      <button type="button" className="px-1.5 text-stone-300" aria-label="Cancel new album" onClick={() => { setOpen(false); setTitle(''); }}>✕</button>
    </form>
  );
}

type GlyphName = 'left' | 'right' | 'download' | 'cover' | 'out' | 'hide' | 'show' | 'star' | 'trash' | 'check';
const GLYPHS: Record<GlyphName, React.ReactNode> = {
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 19h14" /></>,
  cover: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 15l4-4 4 4 3-3 5 5" /></>,
  out: <><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /></>,
  hide: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" /><path d="M4 4l16 16" /></>,
  show: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  star: <path d="M12 4l2.4 5 5.5.7-4 3.8 1 5.4L12 16.3 7.1 18.9l1-5.4-4-3.8 5.5-.7Z" />,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  check: <path d="M5 12l5 5 9-10" />,
};

/** Small line icons for the photo viewer's buttons. */
function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
}
