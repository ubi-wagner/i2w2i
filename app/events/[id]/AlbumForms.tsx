'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { createAlbum, deleteAlbum, setAlbumAudience, updateAlbum, type AlbumState } from '../album-actions';

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

/**
 * Who can open the album once it's published. Saves on change, and keeps the
 * saved choice in its state (React resets the form after the action).
 */
export function AlbumAudienceForm({ eventId, albumId, audience, eventAudience }: {
  eventId: string; albumId: string; audience: 'private' | 'public'; eventAudience: string;
}) {
  const [state, action, pending] = useActionState<AlbumState & { audience?: string }, FormData>(
    async (prev, form) => ({ ...(await setAlbumAudience(prev, form)), audience: String(form.get('audience')) }),
    {},
  );
  const value = state.error ? audience : (state.audience ?? audience);
  const options = [
    ['private', 'Private', `Whoever can see the event: ${eventAudience}.`],
    ['public', 'Public', 'Anyone with the album’s link, even without a code or an account. Only this album’s approved photos; nothing else of the event.'],
  ] as const;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <input type="hidden" hidden name="album_id" value={albumId} />
      <fieldset key={value} disabled={pending} className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Who can see it</legend>
        {options.map(([v, label, hint]) => (
          <label key={v} className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-light/40">
            <input type="radio" name="audience" value={v} defaultChecked={v === value} className="mt-1" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            <span><b>{label}</b><span className="block text-sm text-stone-600">{hint}</span></span>
          </label>
        ))}
      </fieldset>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && !pending && <p className="text-sm text-green-700" role="status">{state.message}</p>}
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
