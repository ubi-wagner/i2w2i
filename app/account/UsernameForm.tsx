'use client';

import { useActionState } from 'react';
import { USERNAME_PATTERN } from '@/lib/access';
import { updateUsername, type FormState } from './actions';

export function UsernameForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateUsername, {});
  return (
    <form action={action} className="space-y-1">
      <label className="label" htmlFor="username">Username</label>
      <div className="flex gap-2">
        <input
          className="input font-mono" id="username" name="username" defaultValue={username} required minLength={2} maxLength={32}
          pattern={USERNAME_PATTERN} title="2 to 32 letters or numbers; dots, dashes and _ are fine"
          autoComplete="username" autoCapitalize="none" spellCheck={false}
        />
        <button className="btn-secondary" disabled={pending}>Save</button>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
    </form>
  );
}
