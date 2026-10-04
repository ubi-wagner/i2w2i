'use client';

import { useActionState, useTransition } from 'react';
import { CredentialsShare } from '@/components/CredentialsShare';
import { NewPersonFields, submitWithoutReset } from '@/components/NewPersonFields';
import { inviteToEvent, resetMemberPassword, type PeopleState } from '../actions';

export function HostInviteForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<PeopleState, FormData>(inviteToEvent, {});
  const [, startTransition] = useTransition();
  return (
    <form onSubmit={submitWithoutReset(action, startTransition)} className="space-y-3 rounded-xl bg-stone-50 p-4">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <p className="font-medium">Add someone new</p>
      <NewPersonFields clearOn={state.credentials} />
      <div>
        <label className="label" htmlFor="new_role">Their role</label>
        <select className="input sm:w-auto" id="new_role" name="role" defaultValue="invitee">
          <option value="invitee">Guest</option>
          <option value="curator">Helper</option>
          <option value="owner">Co-host</option>
        </select>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {/* Gone while the next one saves, so nobody passes on the previous person's password. */}
      {state.credentials && state.url && !pending && <CredentialsShare credentials={state.credentials} url={state.url} />}
      <button className="btn" disabled={pending}>Add to this event</button>
      <p className="text-xs text-stone-500">You choose their username and starting password and pass them on yourself (a text, or in person); nothing is emailed. They can change the password once they’re in.</p>
    </form>
  );
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<PeopleState, FormData>(resetMemberPassword, {});
  return (
    <div className="w-full space-y-2">
      <form action={action}>
        <input type="hidden" hidden name="user_id" value={userId} />
        <button className="text-sm text-brand hover:underline" disabled={pending}>Reset password</button>
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.credentials && state.url && !pending && <CredentialsShare credentials={state.credentials} url={state.url} reset />}
    </div>
  );
}
