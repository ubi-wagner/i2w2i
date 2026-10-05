'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { loadIdeas, putTitles, type DemandIdea } from '@/lib/client/ideas';
import { NEEDS, proofText, type Need, type Proof } from '@/lib/menu';
import { withParam, type TaskDraft } from '@/lib/plan';
import { usePod } from '../Pod';
import { ErrorText, Sheet, Spinner } from '../ui';
import { NEED_LABEL } from './parts';
import { mmss, useCountdown, type SceneData } from './useScene';

/** Words of praise to send with a tap (or type your own). */
export const PRAISE = ['Good job ✨', 'Perfect.', 'So proud of you', 'Exactly what I wanted', 'Beautiful', 'Keep going like this', 'You’re a treasure'];

/** The lead's controls while the scene runs, always at the top. */
export function LeadBar({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<'demand' | 'praise' | 'way' | null>(null);
  const left = useCountdown(data.scene.arrival_at, data.skew);
  const coming = left !== null && left > 0;
  const paused = Boolean(data.scene.paused_at);
  return (
    <>
      <div className="grid grid-cols-3 gap-2" aria-label="Quick actions">
        <button type="button" className="btn-follow flex-col gap-0 px-2 py-2 leading-tight" disabled={paused} onClick={() => setOpen('demand')}>
          <span className="text-xl" aria-hidden>⚡</span><span>Demand</span>
        </button>
        <button type="button" className="btn-quiet flex-col gap-0 px-2 py-2 leading-tight" onClick={() => setOpen('praise')}>
          <span className="text-xl" aria-hidden>✨</span><span>Praise</span>
        </button>
        <button type="button" className="btn flex-col gap-0 px-2 py-2 leading-tight" onClick={() => setOpen('way')}>
          <span className="text-xl" aria-hidden>🚗</span><span>{coming ? mmss(left) : 'On my way'}</span>
        </button>
      </div>
      <Sheet open={open === 'demand'} onClose={() => setOpen(null)} title="Send a demand" wide>
        <DemandForm data={data} onDone={async () => { setOpen(null); await reload(); }} />
      </Sheet>
      <Sheet open={open === 'praise'} onClose={() => setOpen(null)} title="Praise">
        <PraiseForm data={data} onDone={async () => { setOpen(null); await reload(); }} />
      </Sheet>
      <Sheet open={open === 'way'} onClose={() => setOpen(null)} title="On my way">
        <OnMyWayForm data={data} onDone={async () => { setOpen(null); await reload(); }} />
      </Sheet>
    </>
  );
}

const WAY_CHOICES = [10, 15, 20, 30, 45, 60, 90];

export function OnMyWayForm({ data, onDone }: { data: SceneData; onDone: () => Promise<void> }) {
  const pod = usePod();
  const [error, setError] = useState('');
  const left = useCountdown(data.scene.arrival_at, data.skew);
  async function go(minutes: number) {
    setError('');
    try {
      await api(`/api/scenes/${data.scene.id}/arrival`, { body: { minutes } });
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="space-y-4">
      <p>How long until you’re home? {pod.title('follow')} gets a countdown and the arrival routine.</p>
      {left !== null && left > 0 && <p className="font-medium text-lead-dark">Right now: arriving in {mmss(left)}.</p>}
      <div className="grid grid-cols-3 gap-2">
        {WAY_CHOICES.map((m) => <button key={m} type="button" className="btn-quiet whitespace-nowrap px-1 text-lg" onClick={() => go(m)}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('1.5 h', '1½ h')}</button>)}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Praise, for the scene or for one task (optionally approving it too). */
export function PraiseForm({ data, taskId, approve, onDone }: { data: SceneData; taskId?: string; approve?: boolean; onDone: () => Promise<void> }) {
  const pod = usePod();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A retry after a dropped connection sends the praise once and approves once.
  const praiseId = useRef(crypto.randomUUID());
  const praised = useRef(false);
  async function send(words: string) {
    const t = words.trim();
    if (!t) return;
    setBusy(true);
    setError('');
    try {
      const id = praiseId.current;
      if (!praised.current) {
        await api(`/api/scenes/${data.scene.id}/entries`, { body: { id, kind: 'praise', taskId: taskId ?? null, bodyEnc: await pod.seal({ text: t }, `entry:${id}`) } });
        praised.current = true;
      }
      if (approve && taskId) await api(`/api/scenes/${data.scene.id}/tasks/${taskId}`, { body: { action: 'approve' } });
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRAISE.map((p) => <button key={p} type="button" className="chip" disabled={busy} onClick={() => send(p)}>{p}</button>)}
      </div>
      <textarea className="input" rows={2} placeholder="Or say it your way…" aria-label="Praise" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn w-full" disabled={busy || !text.trim()} onClick={() => send(text)}>{approve ? 'Approve with praise' : 'Send praise'}</button>
    </div>
  );
}

const COUNTDOWNS = [0, 5, 10, 15, 30, 60];

/**
 * A demand: pick a ready-made one (or write your own), adjust what's
 * needed and how long, send. It lands as a new task with its countdown
 * already running.
 */
export function DemandForm({ data, onDone, about }: { data: SceneData; onDone: () => Promise<void>; about?: string }) {
  const pod = usePod();
  const [ideas, setIdeas] = useState<DemandIdea[] | null>(null);
  const [draft, setDraft] = useState<{ label: string; param?: string; value: string; needs: Proof[]; minutes: number; details: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void loadIdeas().then((i) => setIdeas(i.demands)).catch((e) => setError((e as Error).message)); }, []);
  const groups = useMemo(() => {
    const out = new Map<string, DemandIdea[]>();
    for (const d of ideas ?? []) out.set(d.group, [...(out.get(d.group) ?? []), d]);
    return [...out.entries()];
  }, [ideas]);

  const pick = (d: DemandIdea | null) => setDraft(d
    ? { label: putTitles(d.label, pod.menu.titles), param: d.param, value: '', needs: d.needs.map((n) => ({ ...n })), minutes: d.minutes ?? 0, details: about ? `About: ${about}` : '' }
    : { label: '', value: '', needs: [{ kind: 'photo', count: 1 }], minutes: 10, details: about ? `About: ${about}` : '' });

  // One demand however many tries: a retry never sends it twice.
  const demandId = useRef(crypto.randomUUID());
  async function send() {
    if (!draft) return;
    const title = withParam(draft.label.trim(), draft.value.trim() || undefined, draft.param);
    if (!title) return setError('Say what you want.');
    setBusy(true);
    setError('');
    try {
      const id = demandId.current;
      const body: TaskDraft = { kind: 'demand', title, details: draft.details.trim(), checklist: [], needs: draft.needs, ...(draft.minutes ? { minutes: draft.minutes } : {}) };
      await api(`/api/scenes/${data.scene.id}/tasks`, { body: { id, bodyEnc: await pod.seal(body, `task:${id}`), minutes: draft.minutes || null } });
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!ideas && !error) return <Spinner label="Loading…" />;
  if (!draft) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn-quiet w-full" onClick={() => pick(null)}>✍️ Write your own</button>
        {groups.map(([g, items]) => (
          <div key={g} className="space-y-2">
            <p className="eyebrow text-follow">{g}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((d) => (
                <button key={d.label} type="button" className="chip flex-col items-start gap-0.5" onClick={() => pick(d)}>
                  <span>{putTitles(d.label, pod.menu.titles)}</span>
                  <span className="text-xs font-normal text-ink-soft">{[d.needs.map(proofText).join(' + '), d.minutes ? `${d.minutes} min` : ''].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  const has = (k: Need) => draft.needs.some((n) => n.kind === k);
  const toggle = (k: Need) => setDraft({ ...draft, needs: has(k) ? draft.needs.filter((n) => n.kind !== k) : [...draft.needs, { kind: k, count: 1 }] });
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="demand-what">What you want</label>
        <input id="demand-what" className="input" value={draft.label} maxLength={160} placeholder="e.g. Show me the kitchen floor" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      </div>
      {draft.label.includes('___') && (
        <div>
          <label className="label" htmlFor="demand-blank">{draft.param ?? 'Fill in the blank'}</label>
          <input id="demand-blank" className="input" value={draft.value} maxLength={40} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
        </div>
      )}
      <div>
        <span className="label">Proof</span>
        <div className="flex flex-wrap gap-2">
          {NEEDS.map((k) => <button key={k} type="button" className="chip" aria-pressed={has(k)} onClick={() => toggle(k)}>{NEED_LABEL[k]}</button>)}
        </div>
      </div>
      <div>
        <span className="label">Countdown</span>
        <div className="flex flex-wrap gap-2">
          {COUNTDOWNS.map((m) => <button key={m} type="button" className="chip" aria-pressed={draft.minutes === m} onClick={() => setDraft({ ...draft, minutes: m })}>{m ? `${m} min` : 'None'}</button>)}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="demand-details">Details (optional)</label>
        <textarea id="demand-details" className="input" rows={2} value={draft.details} maxLength={1000} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" className="btn-quiet" onClick={() => setDraft(null)}>Back</button>
        <button type="button" className="btn-follow flex-1" disabled={busy || !draft.label.trim()} onClick={send}>Send the demand</button>
      </div>
    </div>
  );
}
