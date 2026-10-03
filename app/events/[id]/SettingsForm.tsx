'use client';

import { useActionState } from 'react';
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
  };
}

export function SettingsForm({ event }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEvent, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="event_id" value={event.id} />
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
            <option value="draft">Draft: only people on this event</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audience">When published, who can see it?</label>
          <select className="input" id="audience" name="audience" defaultValue={event.audience}>
            <option value="invitees">People on this event, and code holders who can view</option>
            <option value="family">The whole family (signed in)</option>
            <option value="public">Anyone with the link</option>
          </select>
        </div>
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
