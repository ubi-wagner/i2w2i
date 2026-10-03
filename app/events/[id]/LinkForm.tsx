'use client';

import { useActionState, useState } from 'react';
import { LINK_KINDS, type LinkKind } from '@/lib/events/links';
import { addLink, type FormState } from '../actions';

export function LinkForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addLink, {});
  const f = state.fields ?? {};
  const [kind, setKind] = useState<LinkKind>((f.kind as LinkKind) || 'venmo');
  return (
    <form action={action} className="space-y-3 rounded-xl bg-stone-50 p-4">
      <input type="hidden" name="event_id" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)} aria-label="Kind of link">
          {LINK_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
        <input className="input" name="value" required defaultValue={f.value} placeholder={LINK_KINDS.find((k) => k.kind === kind)!.placeholder} aria-label="Handle or link" />
        <input className="input" name="label" defaultValue={f.label} maxLength={80} placeholder="Label (optional)" aria-label="Label" />
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending}>Add link</button>
    </form>
  );
}
