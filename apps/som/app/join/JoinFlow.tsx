'use client';

import { useEffect, useState } from 'react';
import type { Wrapped } from '@/lib/crypto';
import { api, ApiError } from '@/lib/client/api';
import { join, parseJoinFragment, passphraseProblem } from '@/lib/client/vault';
import { ErrorText, Spinner } from '@/components/ui';
import { LoginForm } from '../login/LoginForm';

type Step = 'checking' | 'bad-link' | 'sign-in' | 'used' | 'passphrase' | 'done';
const STASH = 'som-join';

export function JoinFlow() {
  const [step, setStep] = useState<Step>('checking');
  const [link, setLink] = useState<{ podId: string; secret: string } | null>(null);
  const [invite, setInvite] = useState<Wrapped | null>(null);
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check(l: { podId: string; secret: string }) {
    try {
      const r = await api<{ invites: { pod_id: string; invite: Wrapped }[] }>('/api/join');
      const mine = r.invites.find((i) => i.pod_id === l.podId);
      if (!mine) return setStep('used');
      setInvite(mine.invite);
      setStep('passphrase');
    } catch (err) {
      setStep(err instanceof ApiError && err.status === 401 ? 'sign-in' : 'bad-link');
    }
  }

  useEffect(() => {
    // Keep the key out of the address bar and history once read.
    let l = parseJoinFragment(location.hash);
    if (l) {
      sessionStorage.setItem(STASH, JSON.stringify(l));
      history.replaceState(null, '', '/join');
    } else {
      try { l = JSON.parse(sessionStorage.getItem(STASH) ?? 'null'); } catch { l = null; }
    }
    if (!l) return setStep('bad-link');
    setLink(l);
    void check(l);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passphraseProblem(pass);
    if (problem) return setError(problem);
    if (pass !== again) return setError('The two passphrases don’t match.');
    setBusy(true);
    setError('');
    try {
      await join(link!.podId, invite!, link!.secret, pass);
      sessionStorage.removeItem(STASH);
      setStep('done');
      location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-10">
      <p className="text-center font-display text-5xl font-bold tracking-wide text-lead">S·O·M</p>
      {step === 'checking' && <Spinner />}
      {step === 'bad-link' && <div className="card text-center">This link isn’t complete. Open the whole link from the message you were sent.</div>}
      {step === 'used' && <div className="card text-center">This key link has been used already. If that wasn’t you, ask for a new one.</div>}
      {step === 'sign-in' && (
        <div className="card space-y-4">
          <p>Sign in with the username and password from your message.</p>
          <LoginForm next="/join" onDone={() => { setStep('checking'); void check(link!); }} />
        </div>
      )}
      {step === 'passphrase' && (
        <form onSubmit={submit} className="card space-y-4">
          <h1 className="font-display text-2xl">Choose your vault passphrase</h1>
          <p className="text-sm text-ink-soft">It unlocks your scenes on a new phone. It’s yours alone and nobody can reset it, so write it down somewhere safe.</p>
          <div>
            <label className="label" htmlFor="join-pass">Vault passphrase</label>
            <input id="join-pass" className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="join-again">Type it again</label>
            <input id="join-again" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          <button className="btn w-full" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock our scenes'}</button>
        </form>
      )}
      {step === 'done' && <Spinner label="Opening…" />}
    </main>
  );
}
