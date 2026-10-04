'use client';

import { useEffect, useState } from 'react';
import type { Credentials } from '@/lib/client/vault';

/**
 * A partner's username, password and key link, for the person who added
 * them to pass on: a text, or read out. The link carries the key that
 * unlocks your scenes, so it goes only to them.
 */
export function CredentialsShare({ credentials: c, link, note }: { credentials: Credentials; link: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const first = c.name.split(' ')[0];
  const message = [`Hi ${first}! Here’s your way into S-O-M, just for us.`, '', `Open: ${link}`, '', `Username: ${c.username}`, c.password ? `Password: ${c.password}` : '']
    .filter((l, i, a) => l || a[i - 1])
    .join('\n');
  return (
    <div className="space-y-3 rounded-2xl border border-follow/30 bg-follow-light p-4 text-sm" role="status">
      <p>{note ?? `${c.name} is set up. Send ${first} this (it only works once):`}</p>
      <dl className="grid grid-cols-1 gap-x-4 rounded-xl bg-paper-raised px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-1">
        <dt className="text-xs text-ink-soft sm:text-sm">Username</dt>
        <dd aria-label="Their username" className="mb-2 font-mono text-base sm:mb-0">{c.username}</dd>
        {c.password && (
          <>
            <dt className="text-xs text-ink-soft sm:text-sm">Password</dt>
            <dd aria-label="Their password" className="mb-2 font-mono text-base sm:mb-0">{c.password}</dd>
          </>
        )}
        <dt className="text-xs text-ink-soft sm:text-sm">Key link</dt>
        <dd aria-label="Their key link" className="break-all font-mono text-xs">{link}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {canShare && <button type="button" className="btn-follow grow" onClick={() => navigator.share({ text: message }).catch(() => {})}>Text it to {first}…</button>}
        <button type="button" className="btn-quiet grow" onClick={() => navigator.clipboard.writeText(message).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy message'}</button>
      </div>
      <p className="text-xs text-ink-soft">Send it now: it isn’t shown again. The key link unlocks your scenes on {first}’s phone, so send it only to {first}.</p>
    </div>
  );
}
