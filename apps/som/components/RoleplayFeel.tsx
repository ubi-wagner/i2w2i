'use client';

import { useState } from 'react';
import type { Roleplay } from '@/lib/menu';
import { FEEL, FEELS, type Feel, type Profile, type RoleplayFeel } from '@/lib/profile';
import { usePod } from './Pod';
import { useProfiles, type Loaded } from './Profiles';
import { ErrorText } from './ui';

/** "You ❤️ · Sunny 👎": how each of you feels about a roleplay, at a glance. */
export function feelLine(rpId: string, profiles: Record<string, Loaded> | null, me: string, nameOf: (id: string) => string): string {
  if (!profiles) return '';
  return Object.entries(profiles)
    .map(([id, p]) => [id, p.profile.roleplays[rpId]?.feel] as const)
    .filter((x): x is readonly [string, Feel] => Boolean(x[1]))
    .sort(([a], [b]) => (a === me ? -1 : b === me ? 1 : 0))
    .map(([id, f]) => `${id === me ? 'You' : nameOf(id)} ${FEEL[f].icon}`)
    .join(' · ');
}

/** Three quick buttons: love it, it's OK, not for me. */
export function FeelPicker({ value, onPick, label }: { value?: Feel; onPick: (f: Feel) => void; label: string }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
      {FEELS.map((f) => (
        <button key={f} type="button" role="radio" aria-checked={value === f} aria-pressed={value === f} className="chip flex-col justify-center gap-0 px-1 py-1.5 leading-tight" onClick={() => onPick(f)}>
          <span className="text-lg" aria-hidden>{FEEL[f].icon}</span>
          <span className="text-xs font-medium">{FEEL[f].label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Quick loves and dislikes of a roleplay, from each of you: yours to set
 * (a tap, and a few words if you like), theirs to read. Kept in your
 * profiles, so they guide the next pick.
 */
export function RoleplayFeelings({ rp }: { rp: Roleplay }) {
  const pod = usePod();
  const { profiles, update } = useProfiles();
  const mine = profiles?.[pod.account.id]?.profile.roleplays[rp.id] ?? {};
  const others = pod.members.filter((m) => m.account_id !== pod.account.id);
  const [loved, setLoved] = useState<string | null>(null);
  const [disliked, setDisliked] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const words = { loved: loved ?? mine.loved ?? '', disliked: disliked ?? mine.disliked ?? '' };
  const changed = (loved !== null && loved.trim() !== (mine.loved ?? '')) || (disliked !== null && disliked.trim() !== (mine.disliked ?? ''));

  async function save(patch: RoleplayFeel) {
    setError('');
    setState('saving');
    try {
      await update((p: Profile) => {
        const next = { ...(p.roleplays[rp.id] ?? {}), ...patch };
        for (const k of ['loved', 'disliked'] as const) if (!next[k]) delete next[k];
        p.roleplays[rp.id] = next;
      });
      setState('saved');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  }

  if (!profiles) return null;
  return (
    <section className="card space-y-3 border-follow/40" aria-label="Loves and dislikes">
      <div>
        <p className="eyebrow text-follow">🎭 Loves and dislikes</p>
        <p className="font-display text-xl text-lead-dark">{rp.title}</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">You</p>
        <FeelPicker value={mine.feel} label="How you feel about it" onPick={(f) => void save({ feel: f })} />
        <input className="input" aria-label="What you loved" placeholder="Loved… (optional)" maxLength={500} value={words.loved} onChange={(e) => setLoved(e.target.value)} />
        <input className="input" aria-label="What you didn’t love" placeholder="Didn’t love… (optional)" maxLength={500} value={words.disliked} onChange={(e) => setDisliked(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-soft" role="status">{state === 'saving' ? 'Saving…' : state === 'saved' && !changed ? 'Saved' : ''}</span>
          {changed && <button type="button" className="btn-quiet" onClick={() => void save({ loved: words.loved.trim(), disliked: words.disliked.trim() })}>Save words</button>}
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
      {others.map((m) => {
        const f = profiles[m.account_id]?.profile.roleplays[rp.id];
        return (
          <div key={m.account_id} className="space-y-1 border-t border-line pt-3" role="group" aria-label={`${pod.nameOf(m.account_id)}’s loves and dislikes`}>
            <p className="text-sm font-medium">{pod.nameOf(m.account_id)}{f?.feel ? `: ${FEEL[f.feel].icon} ${FEEL[f.feel].label}` : ''}</p>
            {f?.loved && <p className="text-sm"><span className="text-ink-soft">Loved:</span> {f.loved}</p>}
            {f?.disliked && <p className="text-sm"><span className="text-ink-soft">Didn’t love:</span> {f.disliked}</p>}
            {!f && <p className="text-sm text-ink-soft">Not said yet.</p>}
          </div>
        );
      })}
    </section>
  );
}
