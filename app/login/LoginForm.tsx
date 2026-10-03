'use client';

import { useActionState, useEffect, useState } from 'react';
import { collectClientInfo } from '@/lib/client-info';
import { loginWithPassword, requestLoginLink, type FormState } from './actions';

export function LoginForm({ next, emailEnabled }: { next: string; emailEnabled: boolean }) {
  const [mode, setMode] = useState<'link' | 'password'>('password');
  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(loginWithPassword, {});
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(requestLoginLink, {});
  const state = mode === 'password' ? pwState : linkState;
  const [client, setClient] = useState('');
  useEffect(() => {
    collectClientInfo().then((c) => setClient(JSON.stringify(c))).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      {emailEnabled && <div className="grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm">
        {(['password', 'link'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-2 font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-stone-600'}`}
          >
            {m === 'link' ? 'Email me a link' : 'Password'}
          </button>
        ))}
      </div>}

      <form action={mode === 'password' ? pwAction : linkAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="client" value={client} />
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
      {mode === 'link' && <p className="text-center text-xs text-stone-500">Forgot your password? We’ll email you a link that signs you in.</p>}
      {!emailEnabled && (
        <p className="text-center text-sm text-stone-600">
          Forgot your password, or haven’t set one yet? Ask the person who invited you (or Eric) for a new sign-in link.
        </p>
      )}
    </div>
  );
}
