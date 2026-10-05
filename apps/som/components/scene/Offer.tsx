'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { blocksFor, cleanPlan, emptyPlan, pacingFor, placeLoose, type Plan } from '@/lib/plan';
import { newId, proofText, type Roleplay, type Template } from '@/lib/menu';
import { lovedByAll } from '@/lib/profile';
import { useProfiles } from '../Profiles';
import { feelLine } from '../RoleplayFeel';
import { CAPACITIES, startState, type Capacity, type Role } from '@/lib/rules';
import { usePod } from '../Pod';
import { ErrorText, Sheet } from '../ui';
import { KIND_ICON } from './parts';
import { DayList } from './Day';
import { AheadList, SceneSummary } from './Summary';
import { RoleplayCard } from './Roleplay';
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

/** An answer to an offer: how much the follow can take on (the follow's answer only), and a note. */
export interface Reply { capacity: Capacity | null; note: string }

/** The follow's answer to this offer, decrypted (null if there isn't one). */
export function useReply(scene: SceneRow): Reply | null {
  const pod = usePod();
  const [reply, setReply] = useState<Reply | null>(null);
  useEffect(() => {
    if (!scene.reply_enc) return setReply(null);
    void pod.open<Reply>(scene.reply_enc, `reply:${scene.id}`)
      .then((r) => setReply({ capacity: r.capacity && CAPACITIES.includes(r.capacity) ? r.capacity : null, note: typeof r.note === 'string' ? r.note : '' }))
      .catch(() => setReply(null));
  }, [scene.reply_enc, scene.id, pod]);
  return reply;
}

export function CapacityLine({ reply }: { reply: Reply }) {
  if (!reply.capacity) return null;
  return <p><span className="font-medium">Capacity: {CAPACITY[reply.capacity].label}</span> <span className="text-ink-soft">({CAPACITY[reply.capacity].hint})</span></p>;
}

// ── Picking a window ────────────────────────────────────────────────────────

interface WindowValue { day: string; from: string; until: string }

/** A window to start from: given times, or these hours tomorrow (8:30 to 4:30 unless said). */
function windowValue(start?: string | Date | null, end?: string | Date | null, hours?: { from: string; until: string }): WindowValue {
  if (start && end) return { day: dateValue(new Date(start)), from: timeValue(new Date(start)), until: timeValue(new Date(end)) };
  const now = new Date();
  return { day: dateValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)), from: hours?.from ?? '08:30', until: hours?.until ?? '16:30' };
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
export function OfferForm({ initial, submit, onSubmit, onSaveTemplate, noteLabel = 'A note (optional)' }: {
  /** A window, or just hours (for tomorrow), and a note to start from. */
  initial?: { startsAt?: string | Date | null; endsAt?: string | Date | null; hours?: { from: string; until: string }; note?: string };
  submit: string;
  noteLabel?: string;
  onSubmit: (v: WindowAnswer) => Promise<void>;
  /** Keeping these hours and the note (and whatever the caller adds) as a named template. */
  onSaveTemplate?: (name: string, v: { from: string; until: string; note: string }) => Promise<void>;
}) {
  const [value, setValue] = useState(() => windowValue(initial?.startsAt, initial?.endsAt, initial?.hours));
  const [note, setNote] = useState(initial?.note ?? '');
  const [naming, setNaming] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
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
      {onSaveTemplate && (naming === null ? (
        <div className="text-center">
          <button type="button" className="text-sm text-ink-soft underline" onClick={() => { setNaming(''); setSaved(''); }}>Save as a template</button>
          {saved && <p className="text-sm text-ok" role="status">{saved}</p>}
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl bg-paper-sunk p-3">
          <label className="label" htmlFor="template-name">Template name</label>
          <input id="template-name" className="input" value={naming} maxLength={60} placeholder="e.g. Workday" onChange={(e) => setNaming(e.target.value)} />
          <p className="text-xs text-ink-soft">Keeps the hours, who leads, tasks or roleplay, and the note; never the picks, so each one’s new.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => setNaming(null)}>Cancel</button>
            <button type="button" className="btn" disabled={!naming.trim()} onClick={async () => {
              setError('');
              try {
                await onSaveTemplate(naming.trim(), { from: value.from, until: value.until, note: note.trim() });
                setSaved(`Saved “${naming.trim()}”.`);
                setNaming(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}>Save template</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Starting from a saved template of this kind: its hours, who leads and the note. */
function TemplateChips({ kind, active, name, onPick }: { kind: Template['kind']; active: string; name?: string; onPick: (t: Template) => void }) {
  const pod = usePod();
  const list = pod.menu.templates.filter((t) => t.kind === kind);
  if (!list.length) return null;
  return (
    <section className="space-y-2">
      <span className="label">Start from a template</span>
      <div className="flex flex-wrap gap-2">
        {list.map((t) => <button key={t.id} type="button" className="chip" aria-pressed={active.startsWith(t.id)} onClick={() => onPick(t)}>{t.name}</button>)}
      </div>
      {name && <p className="text-sm text-ink-soft">“{name}”: the shape is set; what’s in it is new.</p>}
    </section>
  );
}

type Preset = { key: string; hours?: { from: string; until: string }; note?: string; name?: string };
const presetFrom = (last?: { startsAt: string; endsAt: string } | null): Preset =>
  ({ key: 'last', hours: last ? { from: timeValue(new Date(last.startsAt)), until: timeValue(new Date(last.endsAt)) } : undefined });

/** A new scene offered for a window. If it can't be (that time is taken, say), no stray draft is left. */
async function offerScene(pod: ReturnType<typeof usePod>, plan: Plan, w: { start: Date; end: Date }, switched: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await api(`/api/pods/${pod.pod.id}/scenes`, { body: { id, planEnc: await pod.seal(plan, `plan:${id}`), roleplay: Boolean(plan.roleplay) } });
  try {
    await api(`/api/scenes/${id}/action`, { body: { action: 'offer', startsAt: w.start.toISOString(), endsAt: w.end.toISOString(), switched } });
  } catch (err) {
    await api(`/api/scenes/${id}/delete`, { body: { agree: true } }).catch(() => {});
    throw err;
  }
  return id;
}

/**
 * Offering (or asking for) a Select-O-Matic scene: who leads (choosing your
 * partner when you usually lead, or yourself when you usually follow, is a
 * switch) and when; it's built from the menu. Roleplays are asked for on
 * their own (AskRoleplay). The other one answers it.
 */
export function NewOffer({ open, onClose, last }: {
  open: boolean;
  onClose: () => void;
  /** Your last offer: a new one starts from its hours and who led. */
  last?: { startsAt: string; endsAt: string; leads: Role } | null;
}) {
  const pod = usePod();
  const router = useRouter();
  const partner = pod.members.find((m) => m.account_id !== pod.account.id);
  const them = partner?.display_name ?? 'Them';
  const who = (leads: Role): 'me' | 'them' => (leads === pod.role ? 'me' : 'them');
  const [leader, setLeader] = useState<'me' | 'them'>(last ? who(last.leads) : pod.role === 'lead' ? 'me' : 'them');
  // Where the form starts: your last offer's hours, or a template's (a new key starts it again).
  const [preset, setPreset] = useState<Preset>(() => presetFrom(last));
  const leaderRole: Role = leader === 'me' ? pod.role : (partner?.role ?? (pod.role === 'lead' ? 'follow' : 'lead'));
  const switched = leaderRole === 'follow';
  /** Stage the whole scene first (a draft), then offer it from the builder. */
  async function buildFirst() {
    const id = crypto.randomUUID();
    await api(`/api/pods/${pod.pod.id}/scenes`, { body: { id, planEnc: await pod.seal(emptyPlan(pod.menu), `plan:${id}`) } });
    router.push(`/scene/${id}`);
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Plan a scene with ${them}`}>
      <div className="space-y-5">
        <TemplateChips kind="tasks" active={preset.key} name={preset.name}
          onPick={(t) => { setLeader(who(t.leads)); setPreset({ key: `${t.id}-${Date.now()}`, hours: { from: t.from, until: t.until }, note: t.note, name: t.name }); }} />
        <section className="space-y-2">
          <span className="label">Who leads?</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="chip justify-center" aria-pressed={leader === 'me'} onClick={() => setLeader('me')}>I lead</button>
            <button type="button" className="chip justify-center" aria-pressed={leader === 'them'} onClick={() => setLeader('them')}>{them} leads</button>
          </div>
          {switched && <p className="text-sm font-medium text-follow-dark">⇄ A switch: {leader === 'me' ? 'you lead' : `${them} leads`} this one.</p>}
          {leader === 'me' && !switched ? (
            <div className="space-y-2 text-sm">
              <p className="text-ink-soft">Offer the time now and build it once it’s agreed, or build it first: {them} sees the whole scene (and what to get ready) before saying yes.</p>
              <button type="button" className="btn-quiet w-full" onClick={buildFirst}>Build it first, then offer it</button>
            </div>
          ) : <p className="text-sm text-ink-soft">{leader === 'me' ? 'You build it once it’s agreed.' : `${them} builds it once it’s agreed.`}</p>}
        </section>
        <OfferForm
          key={preset.key}
          initial={{ hours: preset.hours, note: preset.note }}
          submit={leader === 'me' ? 'Send the offer' : 'Send the request'}
          noteLabel={`A note for ${them} (optional)`}
          onSaveTemplate={async (name, v) => {
            const t: Template = { id: newId(), name, ...v, leads: leaderRole, kind: 'tasks' };
            await pod.saveMenu((m) => ({ ...m, templates: [...m.templates.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), t] }));
          }}
          onSubmit={async ({ start, end, note }) => {
            const id = await offerScene(pod, cleanPlan({ ...emptyPlan(pod.menu, hoursOf(start, end)), note }), { start, end }, switched);
            router.push(`/scene/${id}`);
          }}
        />
      </div>
    </Sheet>
  );
}

/**
 * Asking for a roleplay: a nudge, kept apart from Select-O-Matic scenes.
 * Pick one (each says who leads it, so one led by whoever usually follows
 * is a switch), a day and a note. The other reads it, you talk it over,
 * and their yes means it's on: nothing to build.
 */
export function AskRoleplay({ open, onClose, last, history = {} }: {
  open: boolean;
  onClose: () => void;
  /** The last roleplay you asked for: a new one starts from its hours. */
  last?: { startsAt: string; endsAt: string } | null;
  /** How often each roleplay has been played, and when last. */
  history?: Record<string, { count: number; last: string }>;
}) {
  const pod = usePod();
  const router = useRouter();
  const partner = pod.members.find((m) => m.account_id !== pod.account.id);
  const them = partner?.display_name ?? 'Them';
  const [rpId, setRpId] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>(() => presetFrom(last));
  const all = pod.menu.roleplays;
  const groups = [...new Set(all.map((r) => r.group))];
  const rp = all.find((r) => r.id === rpId) ?? null;
  return (
    <Sheet open={open} onClose={onClose} title={`A roleplay with ${them}`}>
      <div className="space-y-5">
        <p className="text-sm text-ink-soft">Pick one you’d like and a day. {them} reads it, you talk it over, and a yes means it’s on.</p>
        <TemplateChips kind="roleplay" active={preset.key} name={preset.name}
          onPick={(t) => setPreset({ key: `${t.id}-${Date.now()}`, hours: { from: t.from, until: t.until }, note: t.note, name: t.name })} />
        {all.length ? (
          <section className="space-y-2">
            <span className="label">Which one?</span>
            <RoleplayPicker choices={all} groups={groups} value={rpId} onChange={setRpId} history={history} />
          </section>
        ) : <p className="text-sm text-ink-soft">No roleplays yet. Add some on the Menu page.</p>}
        {rp && <p className="text-sm font-medium text-follow-dark">{rp.leads === pod.role ? 'You lead' : `${them} leads`} this one{rp.leads === 'follow' ? ' ⇄ a switch' : ''}.</p>}
        <OfferForm
          key={preset.key}
          initial={{ hours: preset.hours, note: preset.note }}
          submit={`Send it to ${them}`}
          noteLabel={`A note for ${them} (optional)`}
          onSubmit={async ({ start, end, note }) => {
            if (!rp) throw new Error('Pick a roleplay.');
            const id = await offerScene(pod, cleanPlan({ ...emptyPlan(pod.menu, hoursOf(start, end)), note, roleplay: rp }), { start, end }, rp.leads === 'follow');
            router.push(`/scene/${id}`);
          }}
        />
      </div>
    </Sheet>
  );
}

/**
 * Picking a roleplay: who leads each, how each of you feels about it, the
 * ones never played first. One your partner said isn't for them can't be
 * picked.
 */
function RoleplayPicker({ choices, groups, value, onChange, history }: {
  choices: Roleplay[]; groups: string[]; value: string | null; onChange: (id: string) => void;
  history: Record<string, { count: number; last: string }>;
}) {
  const pod = usePod();
  const { profiles } = useProfiles();
  const partner = pod.members.find((m) => m.account_id !== pod.account.id);
  const feel = (id: string, rp: string) => profiles?.[id]?.profile.roleplays[rp]?.feel;
  const leads = (r: Roleplay) => `${r.leads === pod.role ? 'You lead' : `${partner?.display_name ?? 'They'} leads`}${r.leads === 'follow' ? ' ⇄' : ''}`;
  // Never played first (novelty), then ones you both love, then the longest ago.
  const loved = (r: Roleplay) => lovedByAll([r], Object.values(profiles ?? {}).map((p) => p.profile)).length > 0 && Object.keys(profiles ?? {}).length > 1;
  const order = (a: Roleplay, b: Roleplay) => Number(Boolean(history[a.id])) - Number(Boolean(history[b.id]))
    || Number(!loved(a)) - Number(!loved(b)) || (history[a.id]?.last ?? '').localeCompare(history[b.id]?.last ?? '');
  return (
    <>
      {groups.map((g) => (
        <div key={g} className="space-y-2" role="radiogroup" aria-label={g || 'Roleplays'}>
          {g && <p className="eyebrow text-follow">{g}</p>}
          {choices.filter((r) => r.group === g).sort(order).map((r) => {
            const no = partner && feel(partner.account_id, r.id) === 'no';
            const line = feelLine(r.id, profiles, pod.account.id, (id) => pod.members.find((m) => m.account_id === id)?.display_name ?? 'Them');
            return (
              <button key={r.id} type="button" role="radio" aria-checked={value === r.id} aria-pressed={value === r.id} disabled={no}
                className="chip w-full flex-col items-start gap-0.5 text-left disabled:opacity-60" onClick={() => onChange(r.id)}>
                <span className="font-medium">{r.title}</span>
                <span className="text-xs font-normal text-ink-soft">{[leads(r), r.location, r.intensity].filter(Boolean).join(' · ')}</span>
                <span className="text-xs font-normal text-ink-soft">{history[r.id] ? `Played ${history[r.id]!.count}× · last ${dayText(new Date(history[r.id]!.last))}` : '🆕 Not played yet'}</span>
                {no ? <span className="text-xs font-medium text-stop">👎 Not for {partner!.display_name}</span> : line && <span className="text-xs font-normal">{line}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** An offer (or request) on the table: the other one accepts, asks for a change or says no; whoever made it agrees, changes it or takes it back. */
export function OfferView({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene, role, plan } = data;
  const mine = scene.offered_by === pod.account.id;
  const other = pod.members.find((m) => m.account_id !== pod.account.id);
  const otherName = other ? pod.nameOf(other.account_id) : 'your partner';
  const offererRole: Role = mine ? role : role === 'lead' ? 'follow' : 'lead';
  const request = offererRole === 'follow';
  const cr = scene.change_request;
  const reply = useReply(scene);
  const ends = useCountdown(scene.ends_at, data.skew);
  const passed = ends !== null && ends <= 0;
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [sheet, setSheet] = useState<'change' | 'reoffer' | null>(null);
  const [error, setError] = useState('');
  // A roleplay asked for is a nudge: nothing to build, so a yes means it's on.
  const roleplay = Boolean(plan.roleplay);
  // Only the one who follows says how much they can take on (for tasks).
  const askCapacity = !mine && role === 'follow' && !roleplay;
  const cap = capacity ?? reply?.capacity ?? 'normal';
  const acceptSends = !mine && roleplay;
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
  async function accept() {
    if (acceptSends) return act('accept_send', { tasks: [], checkinMinutes: null });
    return act('accept', askCapacity ? { replyEnc: await seal({ capacity: cap, note: '' }) } : {});
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-2 border-lead/40 bg-lead-light">
        <p className="eyebrow text-lead">
          {roleplay
            ? (mine ? 'You’d like this roleplay' : `${scene.offered_by ? pod.nameOf(scene.offered_by) : otherName} would like this roleplay`)
            : mine ? (request ? 'Your request' : 'Your offer') : `${scene.offered_by ? pod.nameOf(scene.offered_by) : otherName} ${request ? 'asks you for a scene' : 'offers you a scene'}`}
        </p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.ends_at)}</p>
        <p className="text-sm text-lead-dark">{lengthText(scene.starts_at, scene.ends_at)} · {role === 'lead' ? 'you lead' : `${pod.title('lead')} leads`}</p>
        {plan.note && <p className="whitespace-pre-wrap">“{plan.note}”</p>}
      </section>
      {plan.roleplay && <RoleplayCard rp={plan.roleplay} open={!mine} />}
      {/* Everything that's staged, so whoever answers knows exactly what they're saying yes to. */}
      {!roleplay && <SceneSummary data={data} showNote={false} />}

      {passed && <p className="card border-warn/40 bg-warn-light">This time has passed.{mine ? ' Offer a new one, or take it back.' : ` ${otherName} can offer a new one.`}</p>}

      {cr && (
        <section className="card space-y-2 border-follow/50 bg-follow-light" aria-label="Change asked for">
          <p className="eyebrow text-follow-dark">{mine ? `${otherName} asks for a change` : 'You asked for'}</p>
          <p className="font-display text-xl">{cr.startsAt ? when(cr.startsAt, cr.endsAt) : 'The same time'}</p>
          {cr.startsAt && <p className="text-sm">{lengthText(cr.startsAt, cr.endsAt)}</p>}
          {reply && <CapacityLine reply={reply} />}
          {reply?.note && <p className="whitespace-pre-wrap">“{reply.note}”</p>}
        </section>
      )}

      <ErrorText>{error}</ErrorText>
      {mine ? (
        <div className="grid gap-2">
          {cr && !passed && <button type="button" className="btn" onClick={() => act('agree_change')}>Agree to the change</button>}
          {!cr && !passed && <p className="text-sm text-ink-soft">Waiting for {otherName} to answer.</p>}
          <button type="button" className={passed ? 'btn' : 'btn-quiet'} onClick={() => setSheet('reoffer')}>{cr ? 'Offer a different time' : passed ? 'Offer a new time' : 'Change the time'}</button>
          <button type="button" className="btn-quiet" onClick={() => { if (confirm('Take this back?')) void act('cancel'); }}>Take it back</button>
        </div>
      ) : !passed && (
        <div className="space-y-3">
          {askCapacity && (
            <div>
              <span className="label">How much can you take on that day?</span>
              <CapacityPicker value={cap} onChange={setCapacity} />
            </div>
          )}
          <div className="grid gap-2">
            <button type="button" className={role === 'follow' ? 'btn-follow' : 'btn'} onClick={accept}>{acceptSends ? 'Accept: it’s on' : 'Accept'}</button>
            <button type="button" className="btn-quiet" onClick={() => setSheet('change')}>{cr ? 'Ask for something else' : 'Ask for a change'}</button>
            <button type="button" className="btn-quiet" onClick={() => { if (confirm('Say no to this one? It goes back to them.')) void act('decline'); }}>Not this time</button>
          </div>
        </div>
      )}

      <Sheet open={sheet === 'change'} onClose={() => setSheet(null)} title="Ask for a change">
        <ChangeForm data={data} capacity={askCapacity ? cap : null} onSubmit={async ({ window, capacity: c, note }) => {
          await api(`/api/scenes/${scene.id}/action`, {
            body: { action: 'request_change', startsAt: window?.start.toISOString() ?? null, endsAt: window?.end.toISOString() ?? null, replyEnc: c || note ? await seal({ capacity: c, note }) : null },
          });
          setSheet(null);
          await reload();
        }} />
      </Sheet>
      <Sheet open={sheet === 'reoffer'} onClose={() => setSheet(null)} title="Change the time">
        <OfferForm
          initial={{ startsAt: cr?.startsAt ?? scene.starts_at, endsAt: cr?.endsAt ?? scene.ends_at }}
          submit="Send the new time"
          noteLabel={`A note for ${otherName} (optional)`}
          onSubmit={async ({ start, end, note }) => {
            const hours = hoursOf(start, end);
            const empty = !plan.blocks.some((b) => b.items.length);
            const next = placeLoose(pod.menu, cleanPlan({ ...plan, pacing: pacingFor(pod.menu, hours)?.id ?? plan.pacing, blocks: empty ? blocksFor(hours) : plan.blocks, note: note || plan.note }));
            await api(`/api/scenes/${scene.id}/action`, { body: { action: 'offer', startsAt: start.toISOString(), endsAt: end.toISOString(), planEnc: await pod.seal(next, `plan:${scene.id}`) } });
            setSheet(null);
            await reload();
          }}
        />
      </Sheet>
    </div>
  );
}

/** Asking for a change: another time (or the same), how much the follow can take on (when it's them asking), and why. */
function ChangeForm({ data, capacity, onSubmit }: {
  data: SceneData;
  capacity: Capacity | null;
  onSubmit: (v: { window: { start: Date; end: Date } | null; capacity: Capacity | null; note: string }) => Promise<void>;
}) {
  const pod = usePod();
  const { scene } = data;
  const other = pod.members.find((m) => m.account_id !== pod.account.id);
  const [value, setValue] = useState(() => windowValue(scene.change_request?.startsAt ?? scene.starts_at, scene.change_request?.endsAt ?? scene.ends_at));
  const [cap, setCap] = useState<Capacity | null>(capacity);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setError('');
    const w = toWindow(value);
    if (!w) return setError('Pick a day and a time.');
    const same = scene.starts_at && scene.ends_at && w.start.getTime() === new Date(scene.starts_at).getTime() && w.end.getTime() === new Date(scene.ends_at).getTime();
    if (!same && w.end.getTime() <= Date.now()) return setError('That time has already passed.');
    if (same && !cap && !note.trim()) return setError('Pick another time, or say what you’d like.');
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
      {cap && (
        <section className="space-y-2">
          <p className="eyebrow text-follow">How much you can take on</p>
          <CapacityPicker value={cap} onChange={setCap} />
        </section>
      )}
      <div>
        <label className="label" htmlFor="change-note">Why, or what would work (optional)</label>
        <textarea id="change-note" className="input" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn-follow w-full" disabled={busy} onClick={go}>Send to {other ? pod.nameOf(other.account_id) : 'them'}</button>
    </div>
  );
}

/** Accepted, and the lead is building it: what the follow sees meanwhile. */
export function BeingBuilt({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene } = data;
  const reply = useReply(scene);
  const [changing, setChanging] = useState(false);
  const passed = scene.ends_at !== null && new Date(scene.ends_at).getTime() <= Date.now() + data.skew;
  return (
    <div className="space-y-5">
      <section className="card space-y-2 border-lead/40 bg-lead-light">
        <p className="eyebrow text-lead">Accepted</p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.ends_at)}</p>
        {reply && <CapacityLine reply={reply} />}
        <p>{passed ? 'This time has passed. Ask for a new one, or call it off.' : `${pod.title('lead')} is building your scene. You’ll hear when it’s sent.`}</p>
      </section>
      {data.plan.roleplay && <RoleplayCard rp={data.plan.roleplay} />}
      <SceneSummary data={data} />
      <div className="grid gap-2">
        <button type="button" className={passed ? 'btn' : 'btn-quiet'} onClick={() => setChanging(true)}>Ask for a different time</button>
        <CallOff data={data} reload={reload} label="Can’t make it this time" />
      </div>
      <Sheet open={changing} onClose={() => setChanging(false)} title="A different time">
        <OfferForm
          initial={passed ? undefined : { startsAt: scene.starts_at, endsAt: scene.ends_at }}
          submit="Send the new time"
          noteLabel={`A note for ${pod.title('lead')} (optional)`}
          onSubmit={async ({ start, end }) => {
            await api(`/api/scenes/${scene.id}/action`, { body: { action: 'offer', startsAt: start.toISOString(), endsAt: end.toISOString() } });
            setChanging(false);
            await reload();
          }}
        />
      </Sheet>
    </div>
  );
}

/** Back out of an agreed or sent scene (it goes back to a draft): one tap and a confirm, no reason needed. */
function CallOff({ data, reload, label }: { data: SceneData; reload: () => Promise<void>; label: string }) {
  const pod = usePod();
  const [error, setError] = useState('');
  const other = data.members.find((m) => m.account_id !== data.me);
  async function go() {
    if (!confirm(`${label}? ${other ? pod.nameOf(other.account_id) : 'Your partner'} will be told, and it goes back to a draft.`)) return;
    setError('');
    try {
      await api(`/api/scenes/${data.scene.id}/action`, { body: { action: 'cancel' } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <>
      <button type="button" className="btn-quiet" onClick={go}>{label}</button>
      <ErrorText>{error}</ErrorText>
    </>
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
        <p className="eyebrow text-lead">{data.plan.roleplay ? 'It’s on' : role === 'lead' ? 'Sent' : `From ${pod.title('lead')}`}</p>
        <p className="font-display text-2xl text-lead-dark">{when(scene.starts_at, scene.ends_at)}</p>
        {left !== null && left > 0 && <p className="text-lead-dark" role="timer">Starts in {until(left)}</p>}
        {state === 'ok' && left !== null && left <= 0 && <p className="font-semibold text-lead-dark">It’s time.</p>}
        {state === 'over' && <p className="font-semibold text-warn">This time has passed.</p>}
        {reply && <CapacityLine reply={reply} />}
      </section>
      {data.plan.note && <p className="card whitespace-pre-wrap">“{data.plan.note}”</p>}
      <AheadList data={data} />
      {data.plan.roleplay && <RoleplayCard rp={data.plan.roleplay} />}
      {(tasks.length > 0 || !data.plan.roleplay) && <section className="card space-y-2" aria-label="The tasks">
        <p className="eyebrow text-follow">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</p>
        <DayList plan={data.plan} scene={scene} tasks={tasks} base={scene.starts_at} row={(t) => (
          <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => onOpen(t.id)}>
            <span className="text-xl" aria-hidden>{KIND_ICON[t.body.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t.body.title}</span>
              <span className="block truncate text-xs text-ink-soft">{[t.body.needs.map(proofText).join(' · '), t.minutes ? `${t.minutes} min` : ''].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        )} />
      </section>}
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-2">
        {(role === 'follow' || data.plan.roleplay) && state !== 'over' && (
          <>
            <button type="button" className="btn-follow min-h-14 text-lg" disabled={busy || state === 'early'} onClick={() => act('start')}>Start the scene</button>
            {state === 'early' && <p className="text-center text-sm text-ink-soft">You can start from {opensAt}.</p>}
          </>
        )}
        {role === 'follow' && state === 'over' && <p className="text-center text-sm text-ink-soft">{pod.title('lead')} can take it back and offer a new time, or either of you can call it off.</p>}
        {role === 'lead' && state !== 'over' && !data.plan.roleplay && <p className="text-center text-sm text-ink-soft">{pod.title('follow')} starts it; you’ll hear when.</p>}
        {role === 'lead' && <button type="button" className={state === 'over' ? 'btn' : 'btn-quiet'} disabled={busy} onClick={() => act('unsend')}>{state === 'over' ? 'Take it back to offer a new time' : 'Take it back to change it'}</button>}
        <CallOff data={data} reload={reload} label={role === 'follow' ? 'Can’t make it this time' : 'Call it off'} />
      </div>
    </div>
  );
}
