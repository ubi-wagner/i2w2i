'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { createAlbum, deleteAlbum, updateAlbum, type AlbumState } from '../album-actions';

/** A new album: just a name (and a line about it); it starts as a draft. */
export function NewAlbumForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState<AlbumState>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createAlbum({ eventId, title, description });
          setState(r);
          if (r.id) { setTitle(''); setDescription(''); router.refresh(); }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label className="label" htmlFor="album_title">Album name</label>
          <input className="input" id="album_title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ceremony" required />
        </div>
        <div>
          <label className="label" htmlFor="album_description">A line about it (optional)</label>
          <input className="input" id="album_description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="Vows under the old oak" />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending || !title.trim()}>Make album</button>
    </form>
  );
}

/** The album's name and description. */
export function AlbumSettingsForm({ eventId, album }: { eventId: string; album: { id: string; title: string; description: string } }) {
  const [state, action, pending] = useActionState<AlbumState, FormData>(updateAlbum, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <input type="hidden" hidden name="album_id" value={album.id} />
      <div>
        <label className="label" htmlFor="title">Album name</label>
        {/* Keyed by what's saved: React resets a form after its action. */}
        <input key={`t-${album.title}`} className="input" id="title" name="title" defaultValue={album.title} maxLength={80} required />
      </div>
      <div>
        <label className="label" htmlFor="description">A line about it (optional)</label>
        <textarea key={`d-${album.description}`} className="input" id="description" name="description" rows={2} defaultValue={album.description} maxLength={1000} />
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn-secondary" disabled={pending}>Save name</button>
    </form>
  );
}

/** Deleting an album asks first; its photos stay on the event. */
export function DeleteAlbumButton({ eventId, albumId, title, then }: { eventId: string; albumId: string; title: string; then?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="text-red-700 hover:underline"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete the album “${title}”? Its photos stay on the event.`)) return;
        const f = new FormData();
        f.set('event_id', eventId);
        f.set('album_id', albumId);
        start(async () => {
          await deleteAlbum(f);
          if (then) router.push(then);
          else router.refresh();
        });
      }}
    >
      Delete album
    </button>
  );
}
