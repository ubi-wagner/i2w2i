'use client';

import { useActionState } from 'react';
import { createAccessCode, type FormState } from '../actions';

export function CodeForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAccessCode, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-3 rounded-xl bg-stone-50 p-4">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="code">Code people type</label>
          <input className="input uppercase" id="code" name="code" placeholder="CB1106" maxLength={40} defaultValue={f.code} />
        </div>
        <div>
          <label className="label" htmlFor="label">Note (for you)</label>
          <input className="input" id="label" name="label" placeholder="Bridesmaids" maxLength={80} defaultValue={f.label} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="can_upload" defaultChecked /> Can add photos &amp; videos</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="can_view" defaultChecked /> Can see the album</label>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending}>Create code + QR</button>
      <p className="text-xs text-stone-500">Every code also gets a QR card. Leave the typed code blank for QR only.</p>
    </form>
  );
}
