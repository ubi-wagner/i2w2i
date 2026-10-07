'use client';

import { useEffect, useState } from 'react';
import { USERNAME_PATTERN, usernameFromName } from '@/lib/access';
import { suggestPassword } from '@/lib/auth/suggest';

/**
 * Name, username and starting password for a new account. The username
 * follows the name until it's edited; the password is suggested and can be
 * swapped or typed over. Everything clears when `clearOn` changes (a person
 * was just added). The form must submit without React's automatic reset
 * (see submitWithoutReset) so an error keeps what was typed.
 */
export function NewPersonFields({ clearOn }: { clearOn: unknown }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [edited, setEdited] = useState(false);
  const [password, setPassword] = useState('');

  // Suggested in the browser, after hydration, so the server never renders it.
  useEffect(() => setPassword((p) => p || suggestPassword()), []);
  useEffect(() => {
    if (!clearOn) return;
    setName(''); setUsername(''); setEdited(false); setPassword(suggestPassword());
  }, [clearOn]);

  return (
    // Name and username side by side; the password gets a row of its own so it's never cut off.
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="display_name">Name</label>
        <input
          className="input" id="display_name" name="display_name" required maxLength={80} autoComplete="off" value={name}
          onChange={(e) => { setName(e.target.value); if (!edited) setUsername(usernameFromName(e.target.value)); }}
        />
      </div>
      <div>
        <label className="label" htmlFor="username">Username</label>
        <input
          className="input" id="username" name="username" required minLength={2} maxLength={32} pattern={USERNAME_PATTERN}
          title="2 to 32 letters or numbers; dots, dashes and _ are fine" autoComplete="off" autoCapitalize="none" spellCheck={false}
          value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase()); setEdited(true); }}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="new_password">Starting password</label>
        <div className="flex gap-1">
          <input
            className="input font-mono" id="new_password" name="password" required minLength={10} maxLength={200}
            autoComplete="off" autoCapitalize="none" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="btn-secondary shrink-0 px-3" onClick={() => setPassword(suggestPassword())} title="Suggest another" aria-label="Suggest another password">↻</button>
        </div>
      </div>
    </div>
  );
}

/**
 * onSubmit for a form of controlled fields: runs the action without the
 * automatic reset a <form action> gets, which would blank them.
 */
export function submitWithoutReset(action: (fd: FormData) => void, startTransition: (fn: () => void) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}
