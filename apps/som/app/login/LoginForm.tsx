'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { ErrorText } from '@/components/ui';

export function LoginForm({ next, onDone }: { next: string; onDone?: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/login', { body: { username, password } });
      if (onDone) onDone();
      else location.href = next;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">Username</label>
        <input id="username" className="input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <button className="btn w-full" disabled={busy}>Sign in</button>
    </form>
  );
}
