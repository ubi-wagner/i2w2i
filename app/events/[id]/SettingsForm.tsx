'use client';

import { useActionState } from 'react';
import { updateEvent, type FormState } from '../actions';

interface Props {
  event: { id: string; status: string; audience: string; chat_enabled: boolean };
}

/** Publishing: whether the album is out, who may see it, and the group chat. */
export function SettingsForm({ event }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEvent, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" hidden name="event_id" value={event.id} />
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
