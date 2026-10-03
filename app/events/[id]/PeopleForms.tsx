'use client';

import { useActionState } from 'react';
import { LinkShare } from '@/components/LinkShare';
import { inviteToEvent, issueSignInLink, type LinkState } from '../actions';

export function HostInviteForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(inviteToEvent, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="space-y-3 rounded-xl bg-stone-50 p-4">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <p className="font-medium">Invite someone by name and email</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className="input" name="display_name" placeholder="Name" aria-label="Name" required maxLength={80} defaultValue={f.display_name} />
        <input className="input" name="email" type="email" placeholder="Email (their username)" aria-label="Email" required defaultValue={f.email} />
        <select className="input" name="role" aria-label="Their role" defaultValue={f.role ?? 'invitee'}>
          <option value="invitee">Guest</option>
          <option value="curator">Helper</option>
          <option value="owner">Co-host</option>
        </select>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      {/* Gone while the next invite saves, so nobody copies the previous person's link. */}
      {state.link && !pending && <LinkShare link={state.link} name={state.name} />}
      <button className="btn" disabled={pending}>Invite</button>
      <p className="text-xs text-stone-500">You’ll get a link to text them. They tap it once and choose a password. Their email is just their username; nothing is emailed.</p>
    </form>
  );
}

export function SignInLinkButton({ userId, eventId }: { userId: string; eventId?: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(issueSignInLink, {});
  return (
    <div className="w-full space-y-2">
      <form action={action}>
        <input type="hidden" hidden name="user_id" value={userId} />
        {eventId && <input type="hidden" hidden name="event_id" value={eventId} />}
        <button className="text-sm text-brand hover:underline" disabled={pending}>New sign-in link</button>
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.link && !pending && <LinkShare link={state.link} name={state.name} note={`For ${state.name}: signs them in once (within 7 days) so they can choose a new password.`} />}
    </div>
  );
}
