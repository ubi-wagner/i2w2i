'use client';

import { useActionState } from 'react';
import { THEMES } from '@/lib/events/themes';
import { updateEvent, type FormState } from '../actions';

interface Props {
  event: {
    id: string;
    title: string;
    starts_on: string;
    location: string;
    description: string;
    status: string;
    audience: string;
    chat_enabled: boolean;
    theme: string;
    gift_note: string;
  };
}

export function SettingsForm({ event }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEvent, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" hidden name="event_id" value={event.id} />
      <div>
        <label className="label" htmlFor="title">Event name</label>
        <input className="input" id="title" name="title" defaultValue={event.title} required maxLength={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="starts_on">Date</label>
          <input className="input" id="starts_on" name="starts_on" type="date" defaultValue={event.starts_on} />
        </div>
        <div>
          <label className="label" htmlFor="location">Place</label>
          <input className="input" id="location" name="location" defaultValue={event.location} maxLength={200} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea className="input" id="description" name="description" rows={3} defaultValue={event.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="status">Album</label>
          <select className="input" id="status" name="status" defaultValue={event.status}>
            <option value="draft">Draft (only people on this event)</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audience">When published, who can see it?</label>
          <select className="input" id="audience" name="audience" defaultValue={event.audience}>
            <option value="invitees">Guests on this event &amp; code holders</option>
            <option value="family">Whole family (signed in)</option>
            <option value="public">Anyone with the link</option>
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Look of the album, join page and printed cards</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/30">
              <input type="radio" name="theme" value={t.id} defaultChecked={event.theme === t.id} className="sr-only" />
              <span className="flex shrink-0 overflow-hidden rounded-full border border-stone-300" aria-hidden="true">
                {t.swatch.map((c) => <span key={c} className="h-6 w-3" style={{ backgroundColor: c }} />)}
              </span>
              <span className="text-sm"><b className="block">{t.name}</b><span className="text-stone-500">{t.blurb}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="gift_note">Note above your gift links (optional)</label>
        <textarea className="input" id="gift_note" name="gift_note" rows={2} maxLength={500} defaultValue={event.gift_note} placeholder="Your presence is the greatest gift. If you’d like to help us start our life together…" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="chat_enabled" defaultChecked={event.chat_enabled} />
        Group chat for people on this event
      </label>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending}>Save</button>
    </form>
  );
}
