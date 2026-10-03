'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { setPassword, type FormState } from './actions';

export function PasswordForm({ hasPassword, needCurrent }: { hasPassword: boolean; needCurrent: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setPassword, {});
  if (state.continueTo) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-green-700" role="status">{state.message} Next time, sign in with your email and this password.</p>
        <Link href={state.continueTo} className="btn">Continue →</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {needCurrent && (
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
