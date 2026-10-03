'use client';

import { useActionState } from 'react';
import { setPassword, type FormState } from './actions';

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-4">
      {hasPassword && (
        <div>
          <label className="label" htmlFor="current">Current password</label>
          <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending}>{hasPassword ? 'Change password' : 'Set password'}</button>
    </form>
  );
}
