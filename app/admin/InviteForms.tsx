'use client';

import { useActionState, useState } from 'react';
import { invitePerson, resendInvite, type InviteState } from './actions';

function LinkResult({ state }: { state: InviteState }) {
  const [copied, setCopied] = useState(false);
  if (!state.link) return null;
  return (
    <div className="space-y-2 rounded-lg bg-stone-100 p-3 text-sm">
      <p>{state.emailed ? `Emailed ${state.name} a link.` : `Email isn’t set up yet. Send ${state.name} this link yourself:`} It works once, for 7 days.</p>
      <div className="flex gap-2">
        <input readOnly value={state.link} className="input bg-white font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
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
            <span><b>Family member</b><br /><span className="text-sm text-stone-600">Views and contributes to what’s shared with them. Signs in by email link.</span></span>
          </label>
          <label className="flex gap-2 rounded-lg border border-stone-200 p-3">
            <input type="radio" name="platform_role" value="creator" defaultChecked={state.fields?.platform_role === 'creator'} />
            <span><b>Creator</b><br /><span className="text-sm text-stone-600">Also creates and runs their own events. Can set a password.</span></span>
          </label>
        </div>
      </fieldset>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <LinkResult state={state} />
      <button className="btn" disabled={pending}>Invite</button>
    </form>
  );
}

export function ResendButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(resendInvite, {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="user_id" value={userId} />
        <button className="text-sm text-brand hover:underline" disabled={pending}>Send link</button>
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <LinkResult state={state} />
    </div>
  );
}
