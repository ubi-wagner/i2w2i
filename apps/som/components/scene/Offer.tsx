'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { cleanPlan, emptyPlan, pacingForHours, type Plan } from '@/lib/plan';
import { usePod } from '../Pod';
import { ErrorText, Sheet } from '../ui';
import { KIND_ICON } from './parts';
import { mmss, useCountdown, type SceneData } from './useScene';
import { proofText } from '@/lib/menu';

/** "Tue 7 Oct, 8:30 AM · 8 hours" on this phone's clock. */
export function when(startsAt: string | Date | null, hours: number | null): string {
  const parts: string[] = [];
  if (startsAt) {
    const d = new Date(startsAt);
    parts.push(`${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`);
  }
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  return parts.join(' · ');
}

/** "2 days", "5 h 20 min", or a mm:ss countdown in the last hour. */
function until(secs: number): string {
  if (secs >= 2 * 86_400) return `${Math.round(secs / 86_400)} days`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)} h ${Math.floor((secs % 3600) / 60)} min`;
  return mmss(secs);
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface OfferValues { startsAt: Date; hours: number; note: string }

/**
 * When and how long: a day (today, tomorrow or another), a start time and a
 * length from the menu's pacing, with an optional note. Used for offering
 * and for asking for a change.
 */
export function OfferForm({ initial, submit, onSubmit, noteLabel = 'A note (optional)' }: {
  initial?: { startsAt?: string | Date | null; hours?: number | null };
  submit: string;
  noteLabel?: string;
  onSubmit: (v: OfferValues) => Promise<void>;
}) {
  const pod = usePod();
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const start = initial?.startsAt ? new Date(initial.startsAt) : null;
  const [day, setDay] = useState(start ? dateValue(start) : dateValue(tomorrow));
  const [time, setTime] = useState(start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : '08:30');
  const [hours, setHours] = useState<number>(initial?.hours ?? pacingForHours(pod.menu, 8)?.hours ?? 8);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const today = dateValue(now);
  const tmrw = dateValue(tomorrow);
  const other = day !== today && day !== tmrw;

  async function go() {
    setError('');
    const [y, m, d] = day.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const startsAt = new Date(y!, m! - 1, d!, hh!, mm!);
    if (Number.isNaN(startsAt.getTime())) return setError('Pick a day and a time.');
    if (startsAt.getTime() < Date.now() - 60 * 60_000) return setError('That time has already passed.');
    setBusy(true);
    try {
      await onSubmit({ startsAt, hours, note: note.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Day</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" aria-pressed={day === today} onClick={() => setDay(today)}>Today</button>
          <button type="button" className="chip" aria-pressed={day === tmrw} onClick={() => setDay(tmrw)}>Tomorrow</button>
          <input type="date" aria-label="Another day" min={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
            className={`chip text-base ${other ? 'border-lead bg-lead-light font-medium text-lead-dark' : ''}`} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="offer-time">Starts at</label>
        <input id="offer-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div>
        <span className="label">How long</span>
        <div className="flex flex-wrap gap-2">
          {pod.menu.pacing.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={hours === p.hours} onClick={() => setHours(p.hours)}>{p.label}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="offer-note">{noteLabel}</label>
        <textarea id="offer-note" className="input" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn w-full" disabled={busy} onClick={go}>{submit}</button>
    </div>
  );
}

/** The lead offers a day: a new scene, sent to the follow to accept. */
export function NewOffer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pod = usePod();
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title={`Offer ${pod.title('follow')} a scene`}>
      <OfferForm
        submit="Send the offer"
        noteLabel={`A note for ${pod.title('follow')} (optional)`}
        onSubmit={async ({ startsAt, hours, note }) => {
          const id = crypto.randomUUID();
          const plan: Plan = cleanPlan({ ...emptyPlan(pod.menu), pacing: pacingForHours(pod.menu, hours)?.id ?? null, note });
          await api(`/api/pods/${pod.pod.id}/scenes`, { body: { id, planEnc: await pod.seal(plan, `plan:${id}`) } });
          await api(`/api/scenes/${id}/action`, { body: { action: 'offer', startsAt: startsAt.toISOString(), hours } });
          router.push(`/scene/${id}`);
        }}
      />
    </Sheet>
  );
}

/** An offer on the table: the follow accepts or asks for a change; the lead agrees, re-offers or withdraws. */
export function OfferView({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene, role, plan } = data;
  const lead = role === 'lead';
  const cr = scene.change_request;
  const [crNote, setCrNote] = useState('');
  const [sheet, setSheet] = useState<'change' | 'reoffer' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cr?.noteEnc) return setCrNote('');
    void pod.open<{ text: string }>(cr.noteEnc, `change:${scene.id}`).then((n) => setCrNote(n.text)).catch(() => setCrNote(''));
  }, [cr?.noteEnc, pod, scene.id]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError('');
    try {
      await api(`/api/scenes/${scene.id}/action`, { body: { action, ...extra } });
      setSheet(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Agreeing to another length changes the plan's pacing to match.
  async function agree() {
    const hours = cr?.hours ?? scene.hours;
    const next = cleanPlan({ ...plan, pacing: (hours && pacingForHours(pod.menu, hours)?.id) || plan.pacing });
    await act('agree_change', { planEnc: await pod.seal(next, `plan:${scene.id}`) });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-3 border-lead/40 bg-lead-light">
        <p className="eyebrow text-lead">{lead ? 'Your offer' : `${pod.title('lead')} offers you a scene`}</p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.hours)}</p>
        {plan.note && <p className="whitespace-pre-wrap">“{plan.note}”</p>}
      </section>

      {cr && (
        <section className="card space-y-2 border-follow/50 bg-follow-light" aria-label="Change asked for">
          <p className="eyebrow text-follow-dark">{lead ? `${pod.title('follow')} asks for a change` : 'You asked for'}</p>
          <p className="font-display text-xl">{when(cr.startsAt ?? scene.starts_at, cr.hours ?? scene.hours)}</p>
          {crNote && <p className="whitespace-pre-wrap">“{crNote}”</p>}
        </section>
      )}

      <ErrorText>{error}</ErrorText>
      {lead ? (
        <div className="grid gap-2">
          {cr && <button type="button" className="btn" onClick={agree}>Agree to the change</button>}
          {!cr && <p className="text-sm text-ink-soft">Waiting for {pod.title('follow')} to accept or ask for a change.</p>}
          <button type="button" className="btn-quiet" onClick={() => setSheet('reoffer')}>{cr ? 'Offer a different time' : 'Change the offer'}</button>
          <button type="button" className="btn-quiet" onClick={() => { if (confirm('Take back this offer?')) void act('cancel'); }}>Take it back</button>
        </div>
      ) : (
        <div className="grid gap-2">
          <button type="button" className="btn-follow" onClick={() => act('accept')}>Accept</button>
          <button type="button" className="btn-quiet" onClick={() => setSheet('change')}>{cr ? 'Ask for something else' : 'Ask for a change'}</button>
        </div>
      )}

      <Sheet open={sheet === 'change'} onClose={() => setSheet(null)} title="Ask for a change">
        <OfferForm
          initial={{ startsAt: scene.starts_at, hours: scene.hours }}
          submit={`Send to ${pod.title('lead')}`}
          noteLabel="Why, or what would work (optional)"
          onSubmit={async ({ startsAt, hours, note }) => {
            const noteEnc = note ? await pod.seal({ text: note }, `change:${scene.id}`) : null;
            await api(`/api/scenes/${scene.id}/action`, { body: { action: 'request_change', startsAt: startsAt.toISOString(), hours, noteEnc } });
            setSheet(null);
            await reload();
          }}
        />
      </Sheet>
      <Sheet open={sheet === 'reoffer'} onClose={() => setSheet(null)} title="Change the offer">
        <OfferForm
          initial={{ startsAt: cr?.startsAt ?? scene.starts_at, hours: cr?.hours ?? scene.hours }}
          submit="Send the new offer"
          noteLabel={`A note for ${pod.title('follow')} (optional)`}
          onSubmit={async ({ startsAt, hours, note }) => {
            const next = cleanPlan({ ...plan, pacing: pacingForHours(pod.menu, hours)?.id ?? plan.pacing, note: note || plan.note });
            await api(`/api/scenes/${scene.id}/action`, { body: { action: 'offer', startsAt: startsAt.toISOString(), hours, planEnc: await pod.seal(next, `plan:${scene.id}`) } });
            setSheet(null);
            await reload();
          }}
        />
      </Sheet>
    </div>
  );
}

/** Accepted, and the lead is building it: what the follow sees meanwhile. */
export function BeingBuilt({ data }: { data: SceneData }) {
  const pod = usePod();
  return (
    <section className="card space-y-2 border-lead/40 bg-lead-light">
      <p className="eyebrow text-lead">Accepted</p>
      <p className="font-display text-2xl text-lead-dark">{when(data.scene.starts_at, data.scene.hours)}</p>
      <p>{pod.title('lead')} is building your scene. You’ll hear when it’s sent.</p>
    </section>
  );
}

/** Sent and waiting to start: the task list, a countdown, and Start. */
export function ReadyView({ data, reload, onOpen }: { data: SceneData; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const pod = usePod();
  const { scene, role, tasks } = data;
  const left = useCountdown(scene.starts_at, data.skew);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(action: 'start' | 'unsend') {
    if (action === 'unsend' && !confirm(`Take the scene back to change it? ${pod.title('follow')} will be told.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/scenes/${scene.id}/action`, { body: { action } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="card space-y-2 border-lead/40 bg-lead-light text-center">
        <p className="eyebrow text-lead">{role === 'lead' ? 'Sent' : `From ${pod.title('lead')}`}</p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.hours)}</p>
        {left !== null && left > 0 && <p className="text-lead-dark" role="timer">Starts in {until(left)}</p>}
        {left !== null && left <= 0 && <p className="font-semibold text-lead-dark">It’s time.</p>}
      </section>
      {data.plan.note && <p className="card whitespace-pre-wrap">“{data.plan.note}”</p>}
      <section className="card space-y-1" aria-label="The tasks">
        <p className="eyebrow text-follow">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</p>
        <ul className="divide-y divide-line">
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => onOpen(t.id)}>
                <span className="text-xl" aria-hidden>{KIND_ICON[t.body.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.body.title}</span>
                  <span className="block truncate text-xs text-ink-soft">{[t.body.needs.map(proofText).join(' · '), t.minutes ? `${t.minutes} min` : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-2">
        {role === 'follow' && <button type="button" className="btn-follow min-h-14 text-lg" disabled={busy} onClick={() => act('start')}>Start the scene</button>}
        {role === 'lead' && <p className="text-center text-sm text-ink-soft">{pod.title('follow')} starts it; you’ll hear when.</p>}
        {role === 'lead' && <button type="button" className="btn-quiet" disabled={busy} onClick={() => act('unsend')}>Take it back to change it</button>}
      </div>
    </div>
  );
}
