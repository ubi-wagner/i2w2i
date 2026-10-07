'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { section, type MenuItem } from '@/lib/menu';
import { withParam } from '@/lib/plan';
import type { TaskStatus } from '@/lib/rules';
import { usePod } from '../Pod';
import { useDraft } from '../useDraft';
import { clock, ErrorText, Section } from '../ui';
import { MediaGrid } from './Media';
import { RoleplayCard } from './Roleplay';
import { RoleplayFeelings } from '../RoleplayFeel';
import { ArrivalCard, Notes, TaskRow } from './Running';
import { done, KIND_ICON, ProgressBar, TaskChip } from './parts';
import type { EntryView, SceneData } from './useScene';

interface Scores {
  items: { id: string; label: string; score: number }[];
  /** Each task the lead set, scored 1–5 (older scorecards have none). */
  tasks?: { id: string; title: string; score: number; status: TaskStatus; demand?: boolean }[];
  note: string;
}
interface Outcomes {
  groups: { title: string; items: string[] }[];
  service: string[];
  /** What was picked (menu item ids and their blanks), so sharing again starts from it. */
  picks?: Record<string, string>;
}

const latest = (entries: EntryView[], kind: EntryView['kind']) => [...entries].reverse().find((e) => e.kind === kind && e.body);

function TaskList({ data, onOpen }: { data: SceneData; onOpen: (id: string) => void }) {
  return (
    <div className="card space-y-3">
      <ProgressBar tasks={data.tasks} />
      <ul className="divide-y divide-line">
        {data.tasks.map((t) => <li key={t.id}><TaskRow t={t} skew={data.skew} paused onOpen={onOpen} /></li>)}
      </ul>
    </div>
  );
}

/** Inspection: the lead scores each category 1–5 and picks what follows. */
export function Inspection({ data, reload, onOpen }: { data: SceneData; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const pod = usePod();
  const lead = data.role === 'lead';
  const shared = latest(data.entries, 'scores');
  return (
    <div className="space-y-6">
      {!lead && <ArrivalCard data={data} />}
      {data.plan.roleplay && <RoleplayFeelings rp={data.plan.roleplay} />}
      {lead ? <Scorecard data={data} reload={reload} onOpen={onOpen} /> : shared ? <Results data={data} /> : (
        <div className="card border-lead/40 bg-lead-light text-center">
          <p className="font-display text-2xl text-lead-dark">Inspection</p>
          <p className="text-sm text-lead-dark">{pod.title('lead')} is looking everything over. The scorecard shows here when it’s ready.</p>
        </div>
      )}
      <Section title="What was done" eyebrow="Tasks"><TaskList data={data} onOpen={onOpen} /></Section>
      <Notes data={data} reload={reload} />
    </div>
  );
}

function Scorecard({ data, reload, onOpen }: { data: SceneData; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const pod = usePod();
  const cats = section(pod.menu, 'inspection').groups.flatMap((g) => g.items);
  const outcomeGroups = section(pod.menu, 'outcomes').groups;
  const service = section(pod.menu, 'service').groups.flatMap((g) => g.items);
  const prevS = latest(data.entries.filter((e) => e.author_id === pod.account.id), 'scores')?.body as Scores | undefined;
  const prevO = latest(data.entries.filter((e) => e.author_id === pod.account.id), 'outcomes')?.body as Outcomes | undefined;
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries((prevS?.items ?? []).map((i) => [i.id, i.score])));
  const [taskScores, setTaskScores] = useState<Record<string, number>>(() => Object.fromEntries((prevS?.tasks ?? []).map((i) => [i.id, i.score])));
  const follows = data.members.filter((m) => m.role === 'follow').map((m) => m.account_id);
  const proofCount = (taskId: string) => data.media.filter((m) => m.task_id === taskId).length
    + data.entries.filter((e) => e.task_id === taskId && follows.includes(e.author_id) && (e.kind === 'comment' || e.kind === 'writing')).length;
  const unscored = data.tasks.filter((t) => !taskScores[t.id]);
  const fillRest = (n: number) => setTaskScores((s) => ({ ...s, ...Object.fromEntries(unscored.map((t) => [t.id, n])) }));
  const [note, setNote] = useState(prevS?.note ?? '');
  // Sharing again starts from what was shared (older shares only kept the wording, so match on that).
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    if (!prevO) return {};
    if (prevO.picks) return prevO.picks;
    const said = new Set([...prevO.groups.flatMap((g) => g.items), ...prevO.service]);
    return Object.fromEntries([...outcomeGroups.flatMap((g) => g.items), ...service].filter((i) => said.has(i.label)).map((i) => [i.id, '']));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(Boolean(prevS));
  const total = Object.values(scores).reduce((a, b) => a + b, 0) + Object.values(taskScores).reduce((a, b) => a + b, 0);
  const max = (Object.keys(scores).length + Object.keys(taskScores).length) * 5;

  const label = (it: MenuItem) => withParam(it.label, picks[it.id] || undefined, it.param);
  const toggle = (it: MenuItem) => setPicks((p) => {
    const n = { ...p };
    if (it.id in n) delete n[it.id];
    else n[it.id] = '';
    return n;
  });

  async function share() {
    setBusy(true);
    setError('');
    try {
      const s: Scores = {
        items: cats.filter((c) => scores[c.id]).map((c) => ({ id: c.id, label: c.label, score: scores[c.id]! })),
        tasks: data.tasks.filter((t) => taskScores[t.id]).map((t) => ({ id: t.id, title: t.body.title, score: taskScores[t.id]!, status: t.status, ...(t.body.kind === 'demand' ? { demand: true } : {}) })),
        note: note.trim(),
      };
      const o: Outcomes = {
        groups: outcomeGroups.map((g) => ({ title: g.title, items: g.items.filter((i) => i.id in picks).map(label) })).filter((g) => g.items.length),
        service: service.filter((i) => i.id in picks).map(label),
        picks,
      };
      for (const [kind, body] of [['scores', s], ['outcomes', o]] as const) {
        const id = crypto.randomUUID();
        await api(`/api/scenes/${data.scene.id}/entries`, { body: { id, kind, bodyEnc: await pod.seal(body, `entry:${id}`) } });
      }
      setSent(true);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function aftercare() {
    if (!sent && !confirm(`Move to aftercare without sharing a scorecard?`)) return;
    try {
      await api(`/api/scenes/${data.scene.id}/action`, { body: { action: 'aftercare' } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Called, not rendered as <Chips />: a component made anew on each render
  // would remount its boxes on every key, dropping the focus after one letter.
  const chips = (items: MenuItem[]) => (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it.id} className="inline-flex flex-col gap-1">
          <button type="button" className="chip" aria-pressed={it.id in picks} onClick={() => toggle(it)}>{it.id in picks ? '✓ ' : ''}{label(it)}</button>
          {it.id in picks && it.param && (
            <input className="input py-1.5 sm:text-sm" placeholder={it.param} aria-label={`${it.label}: ${it.param}`} value={picks[it.id]} maxLength={40} onChange={(e) => setPicks((p) => ({ ...p, [it.id]: e.target.value }))} />
          )}
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {data.tasks.length > 0 && (
        <Section title="Each task" eyebrow="What you set" action={<span className="text-sm text-ink-soft" role="status">{data.tasks.length - unscored.length} of {data.tasks.length} scored</span>}>
          <div className="card space-y-4">
            {data.tasks.map((t) => (
              <div key={t.id} className="space-y-1.5">
                <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => onOpen(t.id)}>
                  <span className="min-w-0">
                    <span className="font-medium">{KIND_ICON[t.body.kind]} {t.body.title}</span>
                    <span className="block text-xs text-ink-soft">{proofCount(t.id)} sent · tap to look</span>
                  </span>
                  <TaskChip status={t.status} />
                </button>
                <div className="flex gap-2" role="radiogroup" aria-label={`Score for ${t.body.title}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={taskScores[t.id] === n} className="chip h-11 w-11 justify-center px-0 text-lg" aria-pressed={taskScores[t.id] === n}
                      onClick={() => setTaskScores((s) => ({ ...s, [t.id]: n }))}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            {unscored.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <span className="self-center text-sm text-ink-soft">The rest:</span>
                {[3, 4, 5].map((n) => <button key={n} type="button" className="btn-quiet min-h-10 px-3" onClick={() => fillRest(n)}>all {n}s</button>)}
              </div>
            )}
          </div>
        </Section>
      )}
      <Section title="Scorecard" eyebrow="Inspection" action={max > 0 ? <span className="font-display text-xl text-lead" role="status">{total}<span className="text-sm text-ink-soft"> / {max}</span></span> : undefined}>
        <div className="card space-y-4">
          {cats.length === 0 && <p className="text-sm text-ink-soft">No categories in the menu yet; add some under Inspection & scorecard.</p>}
          {cats.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <p className="font-medium">{c.label}</p>
              <div className="flex gap-2" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={scores[c.id] === n} className="chip h-11 w-11 justify-center px-0 text-lg" aria-pressed={scores[c.id] === n}
                    onClick={() => setScores((s) => ({ ...s, [c.id]: n }))}>{n}</button>
                ))}
              </div>
            </div>
          ))}
          <textarea className="input" rows={3} placeholder="Notes for them" aria-label="Inspection notes" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
        </div>
      </Section>
      {outcomeGroups.some((g) => g.items.length) && (
        <Section title="Consequences & rewards" eyebrow="What follows">
          <div className="card space-y-4">
            {outcomeGroups.map((g) => g.items.length > 0 && (
              <div key={g.id} className="space-y-2"><p className="eyebrow text-follow">{g.title}</p>{chips(g.items)}</div>
            ))}
          </div>
        </Section>
      )}
      {service.length > 0 && (
        <Section title="Service" eyebrow="Continuation">
          <div className="card">{chips(service)}</div>
        </Section>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={sent ? 'btn-quiet' : 'btn'} disabled={busy} onClick={share}>{sent ? 'Share again' : `Share with ${pod.title('follow')}`}</button>
        <button type="button" className={sent ? 'btn' : 'btn-quiet'} disabled={Boolean(data.scene.paused_at)} onClick={aftercare}>Time for aftercare</button>
      </div>
      {data.scene.paused_at && <p className="text-right text-sm text-ink-soft">Paused: aftercare waits until it’s resumed.</p>}
      {sent && <Results data={data} />}
    </div>
  );
}

/** The scorecard and what follows, as shared. */
export function Results({ data }: { data: SceneData }) {
  const pod = usePod();
  const s = latest(data.entries, 'scores');
  const o = latest(data.entries, 'outcomes');
  if (!s && !o) return null;
  const scores = s?.body as Scores | undefined;
  const outcomes = o?.body as Outcomes | undefined;
  const rows = [...(scores?.tasks ?? []), ...(scores?.items ?? [])];
  const total = rows.reduce((a, i) => a + i.score, 0);
  const Dots = ({ n }: { n: number }) => (
    <span className="shrink-0 tracking-widest text-follow" aria-label={`${n} of 5`}>{'●'.repeat(n)}<span className="text-line">{'●'.repeat(5 - n)}</span></span>
  );
  return (
    <section className="card space-y-4" aria-label="Results">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-2xl text-lead-dark">Scorecard</p>
        {rows.length > 0 && <p className="font-display text-2xl text-lead">{total}<span className="text-base text-ink-soft"> / {rows.length * 5}</span></p>}
      </div>
      {scores?.tasks && scores.tasks.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow text-follow">Tasks</p>
          {scores.tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0">{t.demand ? '⚡ ' : ''}{t.title}{t.status === 'skipped' ? <span className="text-ink-faint"> (skipped)</span> : null}</span>
              <Dots n={t.score} />
            </div>
          ))}
        </div>
      )}
      {scores && scores.items.length > 0 && (
        <div className="space-y-2">
          {scores.tasks && scores.tasks.length > 0 && <p className="eyebrow text-follow">Overall</p>}
          {scores.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3">
              <span>{i.label}</span>
              <Dots n={i.score} />
            </div>
          ))}
        </div>
      )}
      {scores?.note && <p className="whitespace-pre-wrap rounded-xl bg-paper-sunk p-3">{scores.note}</p>}
      {outcomes?.groups.map((g) => (
        <div key={g.title}><p className="eyebrow text-follow">{g.title}</p><ul className="list-disc pl-5">{g.items.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
      {outcomes && outcomes.service.length > 0 && (
        <div><p className="eyebrow text-follow">Service</p><ul className="list-disc pl-5">{outcomes.service.map((x) => <li key={x}>{x}</li>)}</ul></div>
      )}
      <p className="text-xs text-ink-faint">From {pod.nameOf((s ?? o)!.author_id)} · {clock((s ?? o)!.created_at)}</p>
    </section>
  );
}

/** Aftercare: the shared closing checklist, reflections, and "back to us". */
export function Aftercare({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene } = data;
  const groups = section(pod.menu, 'aftercare').groups.filter((g) => g.items.length);
  const ticks = new Map<string, EntryView>();
  for (const e of data.entries) if (e.kind === 'aftercare' && e.body?.item) ticks.set(e.body.item, e);
  // Shown straight away; the next load confirms it.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const isOn = (id: string) => pending[id] ?? Boolean(ticks.get(id)?.body.checked);
  const [error, setError] = useState('');
  // Everyone who has joined (an invite never opened doesn't hold it up).
  const others = data.members.filter((m) => m.account_id !== data.me && m.has_key);
  const iVoted = scene.close_votes.includes(data.me);

  async function tick(item: MenuItem) {
    setError('');
    try {
      const id = crypto.randomUUID();
      const checked = !isOn(item.id);
      setPending((p) => ({ ...p, [item.id]: checked }));
      await api(`/api/scenes/${scene.id}/entries`, { body: { id, kind: 'aftercare', bodyEnc: await pod.seal({ item: item.id, label: item.label, checked }, `entry:${id}`) } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending((p) => { const n = { ...p }; delete n[item.id]; return n; });
    }
  }

  async function back() {
    setError('');
    try {
      await api(`/api/scenes/${scene.id}/action`, { body: { action: 'close' } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-1 text-center">
        <p className="font-display text-3xl text-lead-dark">Back to us</p>
        <p className="text-ink-soft">The scene is over. Take your time.</p>
      </div>
      {data.plan.roleplay?.aftercare && <RoleplayCard rp={data.plan.roleplay} only="aftercare" />}
      {/* A roleplay isn't scored: each of you says what you loved and didn't. */}
      {data.plan.roleplay && <RoleplayFeelings rp={data.plan.roleplay} />}
      {groups.length > 0 && (
        <Section title="Shutdown & aftercare" eyebrow="Together">
          <div className="card space-y-4">
            {groups.map((g) => (
              <div key={g.id} className="space-y-1.5">
                <p className="eyebrow text-follow">{g.title}</p>
                {g.items.map((it) => {
                  const e = ticks.get(it.id);
                  const on = isOn(it.id);
                  return (
                    <label key={it.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-paper-sunk px-3 py-2">
                      <input type="checkbox" className="h-5 w-5" checked={on} onChange={() => tick(it)} />
                      <span className="flex-1">{it.label}</span>
                      {on && e && <span className="text-xs text-ink-faint">{e.author_id === data.me ? 'You' : pod.nameOf(e.author_id)}</span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </Section>
      )}
      <Reflections data={data} reload={reload} />
      {(!scene.roleplay || data.tasks.length > 0) && (
        <details className="card">
          <summary className="cursor-pointer font-medium">{scene.roleplay ? 'The tasks' : 'The scorecard and tasks'}</summary>
          <div className="mt-4 space-y-4"><Results data={data} /><ProgressBar tasks={data.tasks} /></div>
        </details>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="card space-y-3 text-center">
        {others.map((m) => <p key={m.account_id} className="text-sm text-ink-soft">{pod.nameOf(m.account_id)}: {scene.close_votes.includes(m.account_id) ? 'back to us ✓' : 'not yet'}</p>)}
        {iVoted ? <p className="font-medium">You’re back to us. It closes when {others.length === 1 ? pod.nameOf(others[0]!.account_id) : 'everyone'} is too.</p> : (
          <button type="button" className="btn w-full" onClick={back}>I’m back to us</button>
        )}
      </div>
    </div>
  );
}

const PROMPTS = [
  ['feel', 'How do you feel?'],
  ['loved', 'What felt loving?'],
  ['change', 'What would you change?'],
] as const;

export function Reflections({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const list = data.entries.filter((e) => e.kind === 'reflection' && e.body);
  const [form, setForm, clearForm] = useDraft(`reflection:${data.scene.id}`, { feel: '', loved: '', change: '', again: '' });
  const reflectionId = useRef(crypto.randomUUID());
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mineCount = list.filter((e) => e.author_id === data.me).length;
  const [writing, setWriting] = useState(mineCount === 0);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const id = reflectionId.current;
      await api(`/api/scenes/${data.scene.id}/entries`, { body: { id, kind: 'reflection', private: priv, bodyEnc: await pod.seal(form, `entry:${id}`) } });
      reflectionId.current = crypto.randomUUID();
      clearForm();
      setWriting(false);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete your reflection?')) return;
    await api(`/api/entries/${id}`, { method: 'DELETE' }).catch((e) => setError((e as Error).message));
    await reload();
  }

  return (
    <Section title="Reflections" eyebrow="Looking back" action={!writing ? <button type="button" className="btn-quiet" onClick={() => setWriting(true)}>Write one</button> : undefined}>
      {list.map((e) => (
        <article key={e.id} className="card space-y-2">
          <p className="text-sm font-semibold">{e.author_id === data.me ? 'You' : pod.nameOf(e.author_id)} {e.private && <span className="ml-1 rounded-full bg-paper-sunk px-2 py-0.5 text-xs font-normal">Only you</span>}</p>
          {PROMPTS.map(([k, q]) => e.body[k] && <div key={k}><p className="text-xs text-ink-soft">{q}</p><p className="whitespace-pre-wrap">{e.body[k]}</p></div>)}
          {e.body.again && <p className="text-sm">Again? <b>{e.body.again}</b></p>}
          {e.author_id === data.me && <button type="button" className="text-xs text-ink-faint underline" onClick={() => remove(e.id)}>Delete</button>}
        </article>
      ))}
      {writing && (
        <div className="card space-y-3">
          {PROMPTS.map(([k, q]) => (
            <div key={k}>
              <label className="label" htmlFor={`r-${k}`}>{q}</label>
              <textarea id={`r-${k}`} className="input" rows={2} value={form[k]} maxLength={4000} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <div>
            <span className="label">Would you do it again?</span>
            <div className="flex gap-2">
              {['Yes', 'Maybe', 'Not like this'].map((a) => <button key={a} type="button" className="chip" aria-pressed={form.again === a} onClick={() => setForm((f) => ({ ...f, again: f.again === a ? '' : a }))}>{a}</button>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Keep this to myself</label>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            {mineCount > 0 && <button type="button" className="btn-quiet" onClick={() => setWriting(false)}>Cancel</button>}
            <button type="button" className="btn" disabled={busy || !(form.feel || form.loved || form.change || form.again)} onClick={send}>Save reflection</button>
          </div>
        </div>
      )}
    </Section>
  );
}

/** A closed scene, to look back on: results, tasks, everything sent, reflections. */
export function Record({ data, reload, onOpen }: { data: SceneData; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const pod = usePod();
  const { scene } = data;
  const mins = scene.started_at && scene.closed_at ? Math.round((new Date(scene.closed_at).getTime() - new Date(scene.started_at).getTime()) / 60000) : null;
  const theirs = data.media.filter((m) => m.status === 'ready');
  return (
    <div className="space-y-6">
      <div className="card text-sm text-ink-soft">
        {scene.started_at && <p>Started {new Date(scene.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{mins !== null ? ` · ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}` : ''}</p>}
        {data.tasks.length > 0 || !data.plan.roleplay
          ? <p>{data.tasks.filter((t) => t.status === 'approved').length} of {data.tasks.length} tasks approved{data.tasks.some((t) => !done(t)) ? `, ${data.tasks.filter((t) => !done(t)).length} unfinished` : ''}.</p>
          : <p>A roleplay, played out.</p>}
      </div>
      {data.plan.roleplay && <RoleplayCard rp={data.plan.roleplay} />}
      {data.plan.roleplay && <RoleplayFeelings rp={data.plan.roleplay} />}
      <Results data={data} />
      {data.tasks.length > 0 && <Section title="Tasks" eyebrow="Record"><TaskList data={data} onOpen={onOpen} /></Section>}
      {theirs.length > 0 && (
        <Section title="Everything sent" eyebrow={`${theirs.length} ${theirs.length === 1 ? 'item' : 'items'}`}>
          <div className="card space-y-2">
            <MediaGrid items={theirs} onChange={reload} />
            <p className="text-xs text-ink-soft">Open one to save it to your phone. Only the person who sent something can delete it.</p>
          </div>
        </Section>
      )}
      <Reflections data={data} reload={reload} />
      <Notes data={data} reload={reload} title="Notes" />
      <p className="text-center text-xs text-ink-faint">Kept for {pod.settings.name}. Decrypted on this phone only.</p>
    </div>
  );
}
