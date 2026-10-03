'use client';

import { useActionState, useEffect, useState } from 'react';
import { collectClientInfo } from '@/lib/client-info';
import { joinWithCode, joinWithQr, type JoinState } from './actions';

export function JoinForm({ slug, token }: { slug: string; token?: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(token ? joinWithQr : joinWithCode, {});
  const [client, setClient] = useState('');
  useEffect(() => {
    collectClientInfo().then((c) => setClient(JSON.stringify(c))).catch(() => {});
  }, []);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {token && <input type="hidden" name="token" value={token} />}
      <input type="hidden" name="client" value={client} />
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input className="input" id="name" name="name" autoComplete="name" required maxLength={60} defaultValue={state.name} placeholder="So everyone knows who shared what" />
      </div>
      {!token && (
        <div>
          <label className="label" htmlFor="code">Album code</label>
          <input className="input font-mono uppercase" id="code" name="code" required autoCapitalize="characters" autoComplete="off" maxLength={40} defaultValue={state.code} placeholder="From your invitation or table card" />
        </div>
      )}
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>Continue</button>
      <p className="text-center text-xs text-stone-500">
        To keep this album safe, your name, device and network details are recorded with anything you share.
      </p>
    </form>
  );
}
