'use client';

import { useEffect, useState } from 'react';
import type { Credentials } from '@/lib/auth/accounts';

/**
 * A new person's username and password, for the person who made the account
 * to pass on: read it out, text it, or copy a ready-made message. There's no
 * email, and i2w2i sends nothing itself.
 */
export function CredentialsShare({ credentials: c, url, reset = false }: { credentials: Credentials; url: string; reset?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);
  const first = c.name.split(' ')[0];
  const message =
    `Hi ${first}! ${reset ? 'Here’s your new password for' : 'You’re all set up on'} i2w2i, our family photo albums.\n\n` +
    `Go to ${url} and sign in with\nUsername: ${c.username}\nPassword: ${c.password}`;
  const host = url.replace(/^https?:\/\//, '').split('/')[0];

  return (
    <div className="space-y-3 rounded-lg bg-stone-100 p-3 text-sm" role="status">
      <p>
        {reset ? <>New password for {c.name}; the old one no longer works.</> : <>{c.name} is set up.</>}{' '}
        Give {first} these to sign in at <b>{host}</b>:
      </p>
      {/* Labels above the values on phones, beside them on wider screens, so a password stays on one line. */}
      <dl className="grid grid-cols-1 items-baseline gap-x-4 rounded-lg bg-white px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-1">
        <dt className="text-xs text-stone-500 sm:text-sm">Username</dt>
        <dd aria-label="Their username" className="mb-2 break-words font-mono text-base sm:mb-0">{c.username}</dd>
        <dt className="text-xs text-stone-500 sm:text-sm">Password</dt>
        <dd aria-label="Their password" className="break-words font-mono text-base">{c.password}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button type="button" className="btn grow" onClick={() => navigator.share({ text: message }).catch(() => {})}>
            Text it to {first}…
          </button>
        )}
        <button type="button" className="btn-secondary grow" onClick={() => navigator.clipboard.writeText(message).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy message'}
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Send it now or write it down: it isn’t shown again. {first} can change the password after signing in.
      </p>
    </div>
  );
}
