'use client';

import { useActionState, useTransition } from 'react';
import { CredentialsShare } from '@/components/CredentialsShare';
import { NewPersonFields, submitWithoutReset } from '@/components/NewPersonFields';
import { invitePerson, resetPersonPassword, type InviteState } from './actions';

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(invitePerson, {});
  const [, startTransition] = useTransition();
  return (
    <form onSubmit={submitWithoutReset(action, startTransition)} className="space-y-4">
      <NewPersonFields clearOn={state.credentials} />
      <fieldset>
        <legend className="label">What can they do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex gap-2 rounded-lg border border-stone-200 p-3">
            <input type="radio" name="platform_role" value="member" defaultChecked />
            <span><b>Family member</b><br /><span className="text-sm text-stone-600">Joins events they’re added to: sees albums, adds photos, chats.</span></span>
          </label>
          <label className="flex gap-2 rounded-lg border border-stone-200 p-3">
            <input type="radio" name="platform_role" value="creator" />
            <span><b>Creator</b><br /><span className="text-sm text-stone-600">Also creates and runs their own events.</span></span>
          </label>
        </div>
      </fieldset>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {/* Gone while the next one saves, so nobody passes on the previous person's password. */}
      {state.credentials && state.url && !pending && <CredentialsShare credentials={state.credentials} url={state.url} />}
      <button className="btn" disabled={pending}>Add person</button>
      <p className="text-xs text-stone-500">You choose their username and starting password and pass them on yourself; nothing is emailed. They can change the password once they’re in.</p>
    </form>
  );
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(resetPersonPassword, {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" hidden name="user_id" value={userId} />
        <button className="text-sm text-brand hover:underline" disabled={pending}>Reset password</button>
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.credentials && state.url && !pending && <CredentialsShare credentials={state.credentials} url={state.url} reset />}
    </div>
  );
}
