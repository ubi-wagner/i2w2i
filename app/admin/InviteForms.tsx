'use client';

import { useActionState } from 'react';
import { LinkShare } from '@/components/LinkShare';
import { invitePerson, resendInvite, type InviteState } from './actions';

function LinkResult({ state }: { state: InviteState }) {
  if (!state.link) return null;
  return (
    <LinkShare
      link={state.link}
      name={state.name}
      note={state.emailed ? `Emailed ${state.name} a link. You can also share it directly; it works once, for 7 days.` : undefined}
    />
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(invitePerson, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="display_name">Name</label>
          <input className="input" id="display_name" name="display_name" required maxLength={80} defaultValue={state.fields?.display_name} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required defaultValue={state.fields?.email} />
        </div>
      </div>
      <fieldset>
        <legend className="label">What can they do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex gap-2 rounded-lg border border-stone-200 p-3">
            <input type="radio" name="platform_role" value="member" defaultChecked={state.fields?.platform_role !== 'creator'} />
            <span><b>Family member</b><br /><span className="text-sm text-stone-600">Joins events they’re added to: sees albums, adds photos, chats.</span></span>
          </label>
          <label className="flex gap-2 rounded-lg border border-stone-200 p-3">
            <input type="radio" name="platform_role" value="creator" defaultChecked={state.fields?.platform_role === 'creator'} />
            <span><b>Creator</b><br /><span className="text-sm text-stone-600">Also creates and runs their own events.</span></span>
          </label>
        </div>
      </fieldset>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {!pending && <LinkResult state={state} />}
      <button className="btn" disabled={pending}>Invite</button>
      <p className="text-xs text-stone-500">They get a one-time link, then choose a password for next time.</p>
    </form>
  );
}

export function ResendButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(resendInvite, {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" hidden name="user_id" value={userId} />
        <button className="text-sm text-brand hover:underline" disabled={pending}>New sign-in link</button>
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {!pending && <LinkResult state={state} />}
    </div>
  );
}
