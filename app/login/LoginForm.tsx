'use client';

import { useActionState, useState } from 'react';
import { loginWithPassword, requestLoginLink, type FormState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<'link' | 'password'>('link');
  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(loginWithPassword, {});
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(requestLoginLink, {});
  const state = mode === 'password' ? pwState : linkState;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm">
        {(['link', 'password'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-2 font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-stone-600'}`}
          >
            {m === 'link' ? 'Email me a link' : 'Password'}
          </button>
        ))}
      </div>

      <form action={mode === 'password' ? pwAction : linkAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
        </div>
        {mode === 'password' && (
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
        )}
        {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
        {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
        <button className="btn w-full" disabled={pwPending || linkPending}>
          {mode === 'password' ? 'Sign in' : 'Send sign-in link'}
        </button>
      </form>
      {mode === 'link' && <p className="text-center text-xs text-stone-500">We’ll email you a link that signs you in. No password needed.</p>}
    </div>
  );
}
