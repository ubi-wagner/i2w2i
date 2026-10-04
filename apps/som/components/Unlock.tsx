'use client';

import { useState } from 'react';
import { unlock } from '@/lib/client/vault';
import type { PodRow } from './Pod';
import { ErrorText } from './ui';

/** A phone without the pod key yet: the vault passphrase opens the backup. */
export function Unlock({ pod, onDone }: { pod: PodRow; onDone: () => Promise<void> }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlock(pod.id, pod.key_backup!, pass);
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <p className="font-display text-4xl text-lead">S·O·M</p>
        <h1 className="font-display text-2xl">Unlock this phone</h1>
        <p className="text-ink-soft">Enter your vault passphrase once and this phone keeps the key.</p>
      </header>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="unlock-pass">Vault passphrase</label>
          <input id="unlock-pass" className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn w-full" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
        <p className="text-sm text-ink-soft">Forgot it? Your partner can send you a new key link from their Settings.</p>
      </form>
    </main>
  );
}

/** Added to a pod but not joined yet: they need the key link they were sent. */
export function WaitingForKey() {
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10 text-center">
      <p className="font-display text-4xl text-lead">S·O·M</p>
      <h1 className="font-display text-2xl">Open your key link</h1>
      <p className="text-ink-soft">Your partner sent you a message with a link. Open that link on this phone to unlock your scenes. If it’s lost or used, ask them for a new one.</p>
    </main>
  );
}
