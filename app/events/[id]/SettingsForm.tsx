'use client';

import { useActionState } from 'react';
import { updateEvent, type FormState } from '../actions';

interface Props {
  event: { id: string; status: string; audience: string; chat_enabled: boolean };
}

/** Publishing: whether the album is out, who may see it, and the group chat. */
export function SettingsForm({ event }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateEvent, {});
  // After saving, show what was saved (React resets the form to its defaults).
  const f = state.fields;
  const status = f?.status ?? event.status;
  const audience = f?.audience ?? event.audience;
  const chat = f ? f.chat_enabled === 'on' : event.chat_enabled;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" hidden name="event_id" value={event.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="status">Album</label>
          <select key={`s-${status}`} className="input" id="status" name="status" defaultValue={status}>
            <option value="draft">Draft (only people on this event)</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audience">When published, who can see it?</label>
          <select key={`a-${audience}`} className="input" id="audience" name="audience" defaultValue={audience}>
            <option value="invitees">People on the event &amp; guest code holders</option>
            <option value="family">Whole family (signed in)</option>
            <option value="public">Anyone with the link</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input key={`c-${chat}`} type="checkbox" name="chat_enabled" defaultChecked={chat} />
        Group chat for people on this event
      </label>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending}>Save</button>
    </form>
  );
}
