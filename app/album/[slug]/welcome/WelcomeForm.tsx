'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { acceptEventInvite, type WelcomeState } from './actions';

export function WelcomeForm({ token, slug, email, isNew }: { token: string; slug: string; email: string; isNew: boolean }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(acceptEventInvite, {});
  if (state.expired) return <UsedLink slug={slug} />;
  return (
    <form action={action} className="space-y-4 text-left">
      <input type="hidden" hidden name="token" value={token} />
      <input type="hidden" hidden name="slug" value={slug} />
      {/* Lets the phone save the email and password together. */}
      <input type="email" className="sr-only" tabIndex={-1} aria-hidden="true" readOnly name="username" autoComplete="username" value={email} />
      <div>
        <label className="label" htmlFor="password">{isNew ? 'Choose a password' : 'Choose a new password'}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="mt-1 text-xs text-stone-500">At least 10 letters or numbers. A short phrase works well.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Type it once more</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn w-full py-3 text-lg" disabled={pending}>{pending ? 'One moment…' : 'See the photos'}</button>
      <p className="text-center text-xs text-stone-500">
        Next time, sign in with <b>{email}</b> and this password. You’ll stay signed in on this phone.
      </p>
    </form>
  );
}

export function UsedLink({ slug }: { slug: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">This link has already been used</h2>
      <p className="text-stone-600">Each link works once. If you already chose a password, sign in with it. Otherwise ask whoever sent it for a new link.</p>
      <Link href={`/login?next=/album/${slug}`} className="btn w-full">Sign in with password</Link>
    </div>
  );
}
