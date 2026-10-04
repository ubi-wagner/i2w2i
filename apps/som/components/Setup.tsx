'use client';

import { useState } from 'react';
import { createPod, passphraseProblem } from '@/lib/client/vault';
import type { Role } from '@/lib/rules';
import type { Account } from './Pod';
import { ErrorText } from './ui';

/** First run: start your pod. The phone makes the key; the passphrase backs it up. */
export function Setup({ account, onDone }: { account: Account; onDone: () => Promise<void> }) {
  const [role, setRole] = useState<Role>('follow');
  const [lead, setLead] = useState('');
  const [follow, setFollow] = useState('');
  const [name, setName] = useState('Us');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passphraseProblem(pass);
    if (problem) return setError(problem);
    if (pass !== again) return setError('The two passphrases don’t match.');
    setBusy(true);
    setError('');
    try {
      await createPod({ role, name: name.trim() || 'Us', titles: { lead: lead.trim() || 'Lead', follow: follow.trim() || 'Follow' }, passphrase: pass });
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const card = (r: Role, head: string, text: string) => (
    <button type="button" aria-pressed={role === r} onClick={() => setRole(r)} className="chip w-full flex-col items-start gap-1 p-4">
      <span className="font-semibold">{head}</span>
      <span className="text-sm text-ink-soft">{text}</span>
    </button>
  );

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="eyebrow text-follow">Welcome, {account.display_name}</p>
        <h1 className="font-display text-3xl text-lead-dark">Set up your pod</h1>
        <p className="text-ink-soft">Everything the two of you write and send here is encrypted on your phones. Not even the server can read it.</p>
      </header>
      <form onSubmit={submit} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="label">Which one are you?</legend>
          {card('follow', 'I prepare and carry out', 'I build the menu and draft scenes; I do the tasks and send proof.')}
          {card('lead', 'I choose and review', 'I pick from the menu, start scenes, review and score.')}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="t-lead">The one who leads is called</label>
            <input id="t-lead" className="input" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="e.g. Captain Kay" maxLength={40} />
          </div>
          <div>
            <label className="label" htmlFor="t-follow">The one who follows is called</label>
            <input id="t-follow" className="input" value={follow} onChange={(e) => setFollow(e.target.value)} placeholder="e.g. Sunny" maxLength={40} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pod-name">Your pod’s name</label>
          <input id="pod-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div className="space-y-3 rounded-2xl border border-line bg-paper-sunk p-4">
          <p className="text-sm"><b>Your vault passphrase</b> unlocks your scenes on a new phone. It’s separate from your password, and nobody can reset it: if you both forget it and lose your phones, your scenes are gone for good. Write it down somewhere safe.</p>
          <div>
            <label className="label" htmlFor="pass">Vault passphrase</label>
            <input id="pass" className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="again">Type it again</label>
            <input id="again" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn w-full" disabled={busy}>{busy ? 'Making your key…' : 'Create our pod'}</button>
      </form>
    </main>
  );
}
