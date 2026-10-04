'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { proofText } from '@/lib/menu';
import { cleanPlan, emptyPlan, pacingFor, type Plan } from '@/lib/plan';
import { CAPACITIES, startState, type Capacity } from '@/lib/rules';
import { usePod } from '../Pod';
import { ErrorText, Sheet } from '../ui';
import { KIND_ICON } from './parts';
import { mmss, useCountdown, type SceneData, type SceneRow } from './useScene';

// An offered scene is a window of the lead's time: a day, from, until. The
// follow answers with their schedule and their capacity (how much they can
// take on that day), encrypted as their reply.

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayText = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const clockText = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Mon, Oct 5 · 8:30 AM – 4:30 PM" on this phone's clock (with the second day if it runs past midnight). */
export function when(startsAt: string | Date | null, endsAt: string | Date | null): string {
  if (!startsAt) return '';
  const s = new Date(startsAt);
  if (!endsAt) return `${dayText(s)} · ${clockText(s)}`;
  const e = new Date(endsAt);
  return `${dayText(s)} · ${clockText(s)} – ${dateValue(e) === dateValue(s) ? '' : `${dayText(e)}, `}${clockText(e)}`;
}

/** "8 hours", "4 h 30 min". */
export function lengthText(startsAt: string | Date | null, endsAt: string | Date | null): string {
  if (!startsAt || !endsAt) return '';
  const mins = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!m) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const hoursOf = (s: string | Date | null, e: string | Date | null) => (s && e ? (new Date(e).getTime() - new Date(s).getTime()) / HOUR : 0);

export const CAPACITY: Record<Capacity, { label: string; hint: string }> = {
  light: { label: 'Light', hint: 'fewer tasks' },
  normal: { label: 'Normal', hint: 'as usual' },
  full: { label: 'Full', hint: 'as much as you like' },
};

/** The follow's answer: how much they can take on, and a note. */
export interface Reply { capacity: Capacity; note: string }

/** The follow's answer to this offer, decrypted (null if there isn't one). */
export function useReply(scene: SceneRow): Reply | null {
  const pod = usePod();
  const [reply, setReply] = useState<Reply | null>(null);
  useEffect(() => {
    if (!scene.reply_enc) return setReply(null);
    void pod.open<Reply>(scene.reply_enc, `reply:${scene.id}`)
      .then((r) => setReply({ capacity: CAPACITIES.includes(r.capacity) ? r.capacity : 'normal', note: typeof r.note === 'string' ? r.note : '' }))
      .catch(() => setReply(null));
  }, [scene.reply_enc, scene.id, pod]);
  return reply;
}

export function CapacityLine({ reply }: { reply: Reply }) {
  return <p><span className="font-medium">Capacity: {CAPACITY[reply.capacity].label}</span> <span className="text-ink-soft">({CAPACITY[reply.capacity].hint})</span></p>;
}

// ── Picking a window ────────────────────────────────────────────────────────

interface WindowValue { day: string; from: string; until: string }

function windowValue(start?: string | Date | null, end?: string | Date | null): WindowValue {
  if (start && end) return { day: dateValue(new Date(start)), from: timeValue(new Date(start)), until: timeValue(new Date(end)) };
  const now = new Date();
  return { day: dateValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)), from: '08:30', until: '16:30' };
}

/** The window as times; an "until" at or before "from" means the next day. */
function toWindow(v: WindowValue): { start: Date; end: Date } | null {
  const [y, mo, d] = v.day.split('-').map(Number);
  const [fh, fm] = v.from.split(':').map(Number);
  const [uh, um] = v.until.split(':').map(Number);
  const start = new Date(y!, mo! - 1, d!, fh!, fm!);
  let end = new Date(y!, mo! - 1, d!, uh!, um!);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) end = new Date(y!, mo! - 1, d! + 1, uh!, um!);
  return { start, end };
}

/** A day (today, tomorrow or another), from, until, and quick lengths. */
function WindowPicker({ value, onChange }: { value: WindowValue; onChange: (v: WindowValue) => void }) {
  const pod = usePod();
  const now = new Date();
  const today = dateValue(now);
  const tmrw = dateValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const other = value.day !== today && value.day !== tmrw;
  const w = toWindow(value);
  const hours = w ? hoursOf(w.start, w.end) : 0;
  const lengths = [...new Set(pod.menu.pacing.map((p) => p.hours))].sort((a, b) => a - b);
  const quick = lengths.some((h) => Math.abs(hours - h) < 0.01);
  const overnight = w !== null && dateValue(w.end) !== dateValue(w.start);
  const forHours = (h: number) => {
    const s = toWindow({ ...value, until: value.from })!.start;
    return { ...value, until: timeValue(new Date(s.getTime() + h * HOUR)) };
  };
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Day</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" aria-pressed={value.day === today} onClick={() => onChange({ ...value, day: today })}>Today</button>
          <button type="button" className="chip" aria-pressed={value.day === tmrw} onClick={() => onChange({ ...value, day: tmrw })}>Tomorrow</button>
          <input type="date" aria-label="Another day" min={today} value={value.day} onChange={(e) => e.target.value && onChange({ ...value, day: e.target.value })}
            className={`chip text-base ${other ? 'border-lead bg-lead-light font-medium text-lead-dark' : ''}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="window-from">From</label>
          <input id="window-from" type="time" className="input px-2.5" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="window-until">Until</label>
          <input id="window-until" type="time" className="input px-2.5" value={value.until} onChange={(e) => e.target.value && onChange({ ...value, until: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lengths.map((h) => (
          <button key={h} type="button" className="chip" aria-pressed={Math.abs(hours - h) < 0.01} onClick={() => onChange(forHours(h))}>{h} {h === 1 ? 'hour' : 'hours'}</button>
        ))}
        {w && (!quick || overnight) && <span className="text-sm text-ink-soft" role="status">{lengthText(w.start, w.end)}{overnight ? ', past midnight' : ''}</span>}
      </div>
    </div>
  );
}

function CapacityPicker({ value, onChange }: { value: Capacity; onChange: (c: Capacity) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How much you can take on">
      {CAPACITIES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-pressed={value === c} className="chip flex-col justify-center gap-0 px-1 py-1.5 leading-tight" onClick={() => onChange(c)}>
          <span className="font-semibold">{CAPACITY[c].label}</span>
          <span className="text-xs font-normal text-ink-soft">{CAPACITY[c].hint}</span>
        </button>
      ))}
    </div>
  );
}

export interface WindowAnswer { start: Date; end: Date; note: string }

/** The lead's offer: when they're yours, and a note. */
export function OfferForm({ initial, submit, onSubmit, noteLabel = 'A note (optional)' }: {
  initial?: { startsAt?: string | Date | null; endsAt?: string | Date | null };
  submit: string;
  noteLabel?: string;
  onSubmit: (v: WindowAnswer) => Promise<void>;
}) {
  const [value, setValue] = useState(() => windowValue(initial?.startsAt, initial?.endsAt));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setError('');
    const w = toWindow(value);
    if (!w) return setError('Pick a day and a time.');
    if (w.end.getTime() <= Date.now()) return setError('That time has already passed.');
    setBusy(true);
    try {
      await onSubmit({ ...w, note: note.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <WindowPicker value={value} onChange={setValue} />
      <div>
        <label className="label" htmlFor="offer-note">{noteLabel}</label>
        <textarea id="offer-note" className="input" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn w-full" disabled={busy} onClick={go}>{submit}</button>
    </div>
  );
}

/** The lead offers a window: a new scene, sent to the follow to answer. */
export function NewOffer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pod = usePod();
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title={`Offer ${pod.title('follow')} a scene`}>
      <p className="mb-4 text-sm text-ink-soft">When you’re {pod.title('follow')}’s. They accept, or ask for another time or a lighter load.</p>
      <OfferForm
        submit="Send the offer"
        noteLabel={`A note for ${pod.title('follow')} (optional)`}
        onSubmit={async ({ start, end, note }) => {
          const id = crypto.randomUUID();
          const plan: Plan = cleanPlan({ ...emptyPlan(pod.menu), pacing: pacingFor(pod.menu, hoursOf(start, end))?.id ?? null, note });
          await api(`/api/pods/${pod.pod.id}/scenes`, { body: { id, planEnc: await pod.seal(plan, `plan:${id}`) } });
          try {
            await api(`/api/scenes/${id}/action`, { body: { action: 'offer', startsAt: start.toISOString(), endsAt: end.toISOString() } });
          } catch (err) {
            // Not offered (that time is taken, say): don't leave a stray draft.
            await api(`/api/scenes/${id}/delete`, { body: { agree: true } }).catch(() => {});
            throw err;
          }
          router.push(`/scene/${id}`);
        }}
      />
    </Sheet>
  );
}

/** An offer on the table: the follow accepts or asks for a change; the lead agrees, re-offers or takes it back. */
export function OfferView({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene, role, plan } = data;
  const lead = role === 'lead';
  const cr = scene.change_request;
  const reply = useReply(scene);
  const ends = useCountdown(scene.ends_at, data.skew);
  const passed = ends !== null && ends <= 0;
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [sheet, setSheet] = useState<'change' | 'reoffer' | null>(null);
  const [error, setError] = useState('');
  const cap = capacity ?? reply?.capacity ?? 'normal';
  const seal = async (r: Reply) => pod.seal(r, `reply:${scene.id}`);

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

  return (
    <div className="space-y-5">
      <section className="card space-y-2 border-lead/40 bg-lead-light">
        <p className="eyebrow text-lead">{lead ? 'Your offer' : `${pod.title('lead')} offers you a scene`}</p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.ends_at)}</p>
        <p className="text-sm text-lead-dark">{lengthText(scene.starts_at, scene.ends_at)}</p>
        {plan.note && <p className="whitespace-pre-wrap">“{plan.note}”</p>}
      </section>

      {passed && <p className="card border-warn/40 bg-warn-light">This time has passed.{lead ? ' Offer a new one, or take it back.' : ` ${pod.title('lead')} can offer a new one.`}</p>}

      {cr && (
        <section className="card space-y-2 border-follow/50 bg-follow-light" aria-label="Change asked for">
          <p className="eyebrow text-follow-dark">{lead ? `${pod.title('follow')} asks for a change` : 'You asked for'}</p>
          <p className="font-display text-xl">{cr.startsAt ? when(cr.startsAt, cr.endsAt) : 'The same time'}</p>
          {cr.startsAt && <p className="text-sm">{lengthText(cr.startsAt, cr.endsAt)}</p>}
          {reply && <CapacityLine reply={reply} />}
          {reply?.note && <p className="whitespace-pre-wrap">“{reply.note}”</p>}
        </section>
      )}

      <ErrorText>{error}</ErrorText>
      {lead ? (
        <div className="grid gap-2">
          {cr && !passed && <button type="button" className="btn" onClick={() => act('agree_change')}>Agree to the change</button>}
          {!cr && !passed && <p className="text-sm text-ink-soft">Waiting for {pod.title('follow')} to accept or ask for a change.</p>}
          <button type="button" className={passed ? 'btn' : 'btn-quiet'} onClick={() => setSheet('reoffer')}>{cr ? 'Offer a different time' : passed ? 'Offer a new time' : 'Change the offer'}</button>
          <button type="button" className="btn-quiet" onClick={() => { if (confirm('Take back this offer?')) void act('cancel'); }}>Take it back</button>
        </div>
      ) : !passed && (
        <div className="space-y-3">
          <div>
            <span className="label">How much can you take on that day?</span>
            <CapacityPicker value={cap} onChange={setCapacity} />
          </div>
          <div className="grid gap-2">
            <button type="button" className="btn-follow" onClick={async () => act('accept', { replyEnc: await seal({ capacity: cap, note: '' }) })}>Accept</button>
            <button type="button" className="btn-quiet" onClick={() => setSheet('change')}>{cr ? 'Ask for something else' : 'Ask for a change'}</button>
          </div>
        </div>
      )}

      <Sheet open={sheet === 'change'} onClose={() => setSheet(null)} title="Ask for a change">
        <ChangeForm data={data} capacity={cap} onSubmit={async ({ window, capacity: c, note }) => {
          await api(`/api/scenes/${scene.id}/action`, {
            body: { action: 'request_change', startsAt: window?.start.toISOString() ?? null, endsAt: window?.end.toISOString() ?? null, replyEnc: await seal({ capacity: c, note }) },
          });
          setSheet(null);
          await reload();
        }} />
      </Sheet>
      <Sheet open={sheet === 'reoffer'} onClose={() => setSheet(null)} title="Change the offer">
        <OfferForm
          initial={{ startsAt: cr?.startsAt ?? scene.starts_at, endsAt: cr?.endsAt ?? scene.ends_at }}
          submit="Send the new offer"
          noteLabel={`A note for ${pod.title('follow')} (optional)`}
          onSubmit={async ({ start, end, note }) => {
            const next = cleanPlan({ ...plan, pacing: pacingFor(pod.menu, hoursOf(start, end))?.id ?? plan.pacing, note: note || plan.note });
            await api(`/api/scenes/${scene.id}/action`, { body: { action: 'offer', startsAt: start.toISOString(), endsAt: end.toISOString(), planEnc: await pod.seal(next, `plan:${scene.id}`) } });
            setSheet(null);
            await reload();
          }}
        />
      </Sheet>
    </div>
  );
}

/** The follow's change: another time (or the same), how much they can take on, and why. */
function ChangeForm({ data, capacity, onSubmit }: {
  data: SceneData;
  capacity: Capacity;
  onSubmit: (v: { window: { start: Date; end: Date } | null; capacity: Capacity; note: string }) => Promise<void>;
}) {
  const pod = usePod();
  const { scene } = data;
  const [value, setValue] = useState(() => windowValue(scene.change_request?.startsAt ?? scene.starts_at, scene.change_request?.endsAt ?? scene.ends_at));
  const [cap, setCap] = useState<Capacity>(capacity);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setError('');
    const w = toWindow(value);
    if (!w) return setError('Pick a day and a time.');
    const same = scene.starts_at && scene.ends_at && w.start.getTime() === new Date(scene.starts_at).getTime() && w.end.getTime() === new Date(scene.ends_at).getTime();
    if (!same && w.end.getTime() <= Date.now()) return setError('That time has already passed.');
    setBusy(true);
    try {
      await onSubmit({ window: same ? null : w, capacity: cap, note: note.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="eyebrow text-follow">When works</p>
        <WindowPicker value={value} onChange={setValue} />
      </section>
      <section className="space-y-2">
        <p className="eyebrow text-follow">How much you can take on</p>
        <CapacityPicker value={cap} onChange={setCap} />
      </section>
      <div>
        <label className="label" htmlFor="change-note">Why, or what would work (optional)</label>
        <textarea id="change-note" className="input" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn-follow w-full" disabled={busy} onClick={go}>Send to {pod.title('lead')}</button>
    </div>
  );
}

/** Accepted, and the lead is building it: what the follow sees meanwhile. */
export function BeingBuilt({ data }: { data: SceneData }) {
  const pod = usePod();
  const reply = useReply(data.scene);
  return (
    <section className="card space-y-2 border-lead/40 bg-lead-light">
      <p className="eyebrow text-lead">Accepted</p>
      <p className="font-display text-2xl text-lead-dark">{when(data.scene.starts_at, data.scene.ends_at)}</p>
      {reply && <CapacityLine reply={reply} />}
      <p>{pod.title('lead')} is building your scene. You’ll hear when it’s sent.</p>
    </section>
  );
}

/** "2 days", "5 h 20 min", or a mm:ss countdown in the last hour. */
function until(secs: number): string {
  if (secs >= 2 * 86_400) return `${Math.round(secs / 86_400)} days`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)} h ${Math.floor((secs % 3600) / 60)} min`;
  return mmss(secs);
}

/** Sent and waiting to start: the task list, a countdown, and Start (from half an hour before). */
export function ReadyView({ data, reload, onOpen }: { data: SceneData; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const pod = usePod();
  const { scene, role, tasks } = data;
  const left = useCountdown(scene.starts_at, data.skew);
  useCountdown(scene.ends_at, data.skew); // ticks the start button open and shut
  const state = startState(scene.starts_at ? new Date(scene.starts_at) : null, scene.ends_at ? new Date(scene.ends_at) : null, new Date(Date.now() + data.skew));
  const reply = useReply(scene);
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
  const opensAt = scene.starts_at ? clockText(new Date(new Date(scene.starts_at).getTime() - 30 * 60_000)) : '';
  return (
    <div className="space-y-5">
      <section className="card space-y-2 border-lead/40 bg-lead-light text-center">
        <p className="eyebrow text-lead">{role === 'lead' ? 'Sent' : `From ${pod.title('lead')}`}</p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.ends_at)}</p>
        {left !== null && left > 0 && <p className="text-lead-dark" role="timer">Starts in {until(left)}</p>}
        {state === 'ok' && left !== null && left <= 0 && <p className="font-semibold text-lead-dark">It’s time.</p>}
        {state === 'over' && <p className="font-semibold text-warn">This time has passed.</p>}
        {reply && <CapacityLine reply={reply} />}
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
        {role === 'follow' && state !== 'over' && (
          <>
            <button type="button" className="btn-follow min-h-14 text-lg" disabled={busy || state === 'early'} onClick={() => act('start')}>Start the scene</button>
            {state === 'early' && <p className="text-center text-sm text-ink-soft">You can start from {opensAt}.</p>}
          </>
        )}
        {role === 'follow' && state === 'over' && <p className="text-center text-sm text-ink-soft">{pod.title('lead')} can offer a new time.</p>}
        {role === 'lead' && state !== 'over' && <p className="text-center text-sm text-ink-soft">{pod.title('follow')} starts it; you’ll hear when.</p>}
        {role === 'lead' && <button type="button" className={state === 'over' ? 'btn' : 'btn-quiet'} disabled={busy} onClick={() => act('unsend')}>{state === 'over' ? 'Take it back to offer a new time' : 'Take it back to change it'}</button>}
      </div>
    </div>
  );
}
