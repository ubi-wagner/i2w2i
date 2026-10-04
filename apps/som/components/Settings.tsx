'use client';

import { useState, useTransition } from 'react';
import { api } from '@/lib/client/api';
import { forgetKeys } from '@/lib/client/keystore';
import { addPartner, changePassphrase, dropFreshKey, passphraseProblem, rawKey, reinvite, takeFreshKey, type Credentials } from '@/lib/client/vault';
import type { Role } from '@/lib/rules';
import { CredentialsShare } from './CredentialsShare';
import { NewPersonFields, submitWithoutReset } from './NewPersonFields';
import { NotifyToggle } from './NotifyToggle';
import { usePod } from './Pod';
import { ErrorText, Section } from './ui';

export function Settings() {
  const pod = usePod();
  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl text-lead-dark">Settings</h1>
      <Section title="Notifications">
        <div className="card"><NotifyToggle purpose="Turn on for this phone." /></div>
      </Section>
      <Partner />
      <Section title="Vault passphrase" eyebrow="Your key">
        <PassphraseForm />
      </Section>
      <Section title="Your account" eyebrow={`Signed in as ${pod.account.username}`}>
        <AccountForms />
      </Section>
      {pod.account.is_admin && <AdminAdd />}
    </div>
  );
}

/** Asks for the vault passphrase when the raw key is needed (inviting, re-inviting). */
function usePassphrase() {
  const pod = usePod();
  return async (pass: string) => takeFreshKey(pod.pod.id) ?? rawKey(pod.pod.id, pod.pod.key_backup!, pass);
}

function Partner() {
  const pod = usePod();
  const getRaw = usePassphrase();
  const [state, setState] = useState<{ credentials?: Credentials; link?: string; error?: string; added?: number }>({});
  const [pass, setPass] = useState('');
  const [role, setRole] = useState<Role>(pod.role === 'lead' ? 'follow' : 'lead');
  const [pending, start] = useTransition();
  const fresh = Boolean(takeFreshKey(pod.pod.id));
  const others = pod.members.filter((m) => m.account_id !== pod.account.id);

  async function add(fd: FormData) {
    try {
      const raw = await getRaw(pass);
      const r = await addPartner(pod.pod.id, raw, { name: String(fd.get('display_name')), username: String(fd.get('username')), password: String(fd.get('password')), role });
      dropFreshKey(pod.pod.id);
      setState({ ...r, added: Date.now() });
      await pod.refresh();
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  async function again(accountId: string, resetPassword: boolean) {
    if (!pass && !fresh) return setState({ error: 'Enter your vault passphrase above first.' });
    try {
      const raw = await getRaw(pass);
      setState(await reinvite(pod.pod.id, raw, accountId, resetPassword));
      await pod.refresh();
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  const addForm = (
          <form onSubmit={submitWithoutReset(add, start)} className={`space-y-3 rounded-2xl bg-paper-sunk ${others.length ? "px-4 pb-4" : "p-4"}`}>
            {!others.length && <p className="font-medium">Add {pod.title(role)}</p>}
            <NewPersonFields clearOn={state.added} />
            <div>
              <label className="label" htmlFor="new-role">They are</label>
              <select id="new-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="lead">{pod.title('lead')} (chooses and reviews)</option>
                <option value="follow">{pod.title('follow')} (prepares and carries out)</option>
              </select>
            </div>
            <button className="btn w-full" disabled={pending}>Add them</button>
          </form>
  );

  return (
    <Section title="Your pod" eyebrow={pod.settings.name}>
      <div id="partner" className="card space-y-4">
        <ul className="divide-y divide-line">
          {pod.members.map((m) => (
            <li key={m.account_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <b>{m.display_name}</b> <span className="font-mono text-sm text-ink-soft">{m.username}</span>
                <span className="ml-2 rounded-full bg-paper-sunk px-2 py-0.5 text-xs">{pod.title(m.role)}</span>
                {!m.has_key && <span className="ml-2 rounded-full bg-warn-light px-2 py-0.5 text-xs text-warn">hasn’t opened their key link</span>}
              </span>
              {m.account_id !== pod.account.id && (
                <span className="flex gap-3 text-sm">
                  <button type="button" className="text-lead underline" onClick={() => again(m.account_id, false)}>New key link</button>
                  <button type="button" className="text-lead underline" onClick={() => again(m.account_id, true)}>Reset password</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!fresh && (
          <div>
            <label className="label" htmlFor="pod-pass">Your vault passphrase (needed to make a key link)</label>
            <input id="pod-pass" className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
        )}
        {state.error && <ErrorText>{state.error}</ErrorText>}
        {state.credentials && state.link && !pending && <CredentialsShare credentials={state.credentials} link={state.link} />}
        {others.length < 5 && (others.length ? (
          <details className="rounded-2xl bg-paper-sunk">
            <summary className="cursor-pointer px-4 py-3 font-medium">Add someone else (a poly pod)</summary>
            {addForm}
          </details>
        ) : addForm)}
      </div>
    </Section>
  );
}

function PassphraseForm() {
  const pod = usePod();
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const problem = passphraseProblem(next);
    if (problem) return setError(problem);
    try {
      await changePassphrase(pod.pod.id, pod.pod.key_backup!, old, next);
      setError('');
      setOld('');
      setNext('');
      setMsg('Saved. Use the new one next time you unlock a phone.');
      await pod.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="card space-y-3">
      <div>
        <label className="label" htmlFor="old-pass">Current vault passphrase</label>
        <input id="old-pass" className="input" type="password" value={old} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="new-pass">New vault passphrase</label>
        <input id="new-pass" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      <ErrorText>{error}</ErrorText>
      {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      <button className="btn-quiet">Change passphrase</button>
    </form>
  );
}

function AccountForms() {
  const pod = usePod();
  const [name, setName] = useState(pod.account.display_name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('');
    setError('');
    try {
      await fn();
      setMsg(ok);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="card space-y-4">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => api('/api/me/name', { method: 'PUT', body: { name } }), 'Name saved.'); }}>
        <div className="grow">
          <label className="label" htmlFor="my-name">Your name</label>
          <input id="my-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <button className="btn-quiet">Save</button>
      </form>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('/api/me/password', { method: 'PUT', body: { current, next } }); setCurrent(''); setNext(''); }, 'Password changed. Other phones will need to sign in again.'); }}>
        <div>
          <label className="label" htmlFor="cur-pw">Current password</label>
          <input id="cur-pw" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="new-pw">New password</label>
          <input id="new-pw" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} />
        </div>
        <button className="btn-quiet">Change password</button>
      </form>
      <ErrorText>{error}</ErrorText>
      {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <button type="button" className="btn-quiet" onClick={async () => { await api('/api/logout', { body: {} }); location.href = '/login'; }}>Sign out</button>
        <button type="button" className="btn-quiet text-stop" onClick={async () => { if (!confirm('Remove the key from this phone and sign out? You’ll need your vault passphrase to unlock it again.')) return; await forgetKeys(); await api('/api/logout', { body: {} }); location.href = '/login'; }}>Sign out and forget this phone</button>
      </div>
    </div>
  );
}

/** For the admin only: an account for someone who'll start their own pod (cousins, later). */
function AdminAdd() {
  const [state, setState] = useState<{ credentials?: Credentials; error?: string; added?: number }>({});
  const [pending, start] = useTransition();
  async function add(fd: FormData) {
    try {
      const r = await api<{ credentials: Credentials }>('/api/admin/accounts', { body: { name: fd.get('display_name'), username: fd.get('username'), password: fd.get('password') } });
      setState({ credentials: r.credentials, added: Date.now() });
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }
  return (
    <Section title="Add someone with their own pod" eyebrow="Admin">
      <form onSubmit={submitWithoutReset(add, start)} className="card space-y-3">
        <p className="text-sm text-ink-soft">They’ll sign in and set up their own pod. You won’t be able to see anything in it.</p>
        <NewPersonFields clearOn={state.added} />
        <ErrorText>{state.error}</ErrorText>
        {state.credentials && !pending && (
          <div className="rounded-xl bg-paper-sunk p-3 text-sm" role="status">
            Give {state.credentials.name} these, with the address of this site: <b className="font-mono">{state.credentials.username}</b> / <b className="font-mono">{state.credentials.password}</b>
          </div>
        )}
        <button className="btn-quiet" disabled={pending}>Add account</button>
      </form>
    </Section>
  );
}
