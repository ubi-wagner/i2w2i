'use client';

import { useState } from 'react';
import { putTitles } from '@/lib/client/ideas';
import type { Roleplay } from '@/lib/menu';
import { usePod } from '../Pod';

/**
 * A roleplay as the scene uses it: who leads, where, what to wear, and how
 * it goes. `open` shows the setup, action and aftercare straight away;
 * otherwise they're a tap away.
 */
export function RoleplayCard({ rp, open: startOpen = false, only }: { rp: Roleplay; open?: boolean; only?: 'aftercare' }) {
  const pod = usePod();
  const [open, setOpen] = useState(startOpen);
  // Written with {lead} / {follow}, like the ideas: the usual titles, whoever leads this one.
  const words = (s: string) => putTitles(s, pod.menu.titles);
  const parts = only ? [['The aftercare', rp.aftercare] as const] : ([['The setup', rp.setup], ['The action', rp.action], ['The aftercare', rp.aftercare]] as const);
  return (
    <section className="card space-y-2 border-follow/40" aria-label="Roleplay">
      <p className="eyebrow text-follow">🎭 Roleplay{rp.group ? ` · ${rp.group}` : ''}</p>
      <p className="font-display text-2xl leading-tight text-lead-dark">{rp.title}</p>
      <p className="text-sm"><span className="font-medium">{pod.title('lead')} leads</span>{[rp.location, rp.intensity].filter(Boolean).map((x) => ` · ${x}`).join('')}</p>
      {rp.attire && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Wearing:</span> {words(rp.attire)}</p>}
      {open || only ? (
        <div className="space-y-3 pt-1">
          {parts.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <p className="eyebrow text-ink-soft">{k}</p>
              <p className="whitespace-pre-wrap">{words(v)}</p>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" className="text-sm font-medium text-follow-dark underline" onClick={() => setOpen(true)}>Read how it goes</button>
      )}
    </section>
  );
}
