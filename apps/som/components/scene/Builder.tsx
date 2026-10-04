'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { proofText, section, type MenuItem, type SectionKind } from '@/lib/menu';
import { cleanPlan, CHECKIN_CHOICES, pacingCheck, pacingOf, picked, planToTasks, withParam, type Plan } from '@/lib/plan';
import { sceneTransition } from '@/lib/rules';
import { usePod } from '../Pod';
import { ProofEditor } from '../ProofEditor';
import { ErrorText, Sheet } from '../ui';
import type { SceneData } from './useScene';

const BUILD_KINDS: SectionKind[] = ['presentation', 'domain', 'errands', 'tasks', 'play', 'arrival'];

/** Drafting a scene from the menu: tap to pick. Saves as you go. */
export function Builder({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene, role } = data;
  const editable = Boolean(sceneTransition(scene.status, 'edit', role));
  const [plan, setPlan] = useState<Plan>(data.plan);
  const [rev, setRev] = useState(scene.plan_rev);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [confirmStart, setConfirmStart] = useState(false);
  // Edits are numbered; a save covers the edits made before it began. One
  // save at a time, so a quick second edit never races the first.
  const planRef = useRef(plan);
  planRef.current = plan;
  const revRef = useRef(rev);
  const edits = useRef(0);
  const savedUpTo = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const dirty = () => edits.current > savedUpTo.current;

  // Someone else's newer version (and we have nothing unsaved): show it.
  // Only strictly newer: a poll that left before our save landed is older.
  useEffect(() => {
    if (!dirty() && !inFlight.current && data.scene.plan_rev > revRef.current) {
      setPlan(data.plan);
      revRef.current = data.scene.plan_rev;
      setRev(data.scene.plan_rev);
    }
  }, [data]);

  const save = useCallback(async () => {
    while (inFlight.current) await inFlight.current;
    if (!dirty() || !editable) return;
    const upTo = edits.current;
    const run = (async () => {
      setSaving('saving');
      try {
        const r = await api<{ rev: number }>(`/api/scenes/${scene.id}/plan`, { method: 'PUT', body: { planEnc: await pod.seal(planRef.current, `plan:${scene.id}`), rev: revRef.current } });
        savedUpTo.current = upTo;
        revRef.current = r.rev;
        setRev(r.rev);
        setSaving(dirty() ? 'idle' : 'saved');
      } catch (err) {
        savedUpTo.current = edits.current;
        setSaving('error');
        setError(err instanceof ApiError && err.status === 409 ? 'Your partner changed this at the same time; showing their version.' : (err as Error).message);
        inFlight.current = null;
        await reload();
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [editable, pod, scene.id, reload]);

  useEffect(() => {
    if (!dirty()) return;
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
  }, [plan, save]);

  const edit = (fn: (p: Plan) => void) => {
    if (!editable) return;
    setPlan((p) => {
      const c = structuredClone(p);
      fn(c);
      return cleanPlan(c);
    });
    edits.current += 1;
    setSaving('idle');
    setError('');
  };

  async function act(action: 'propose' | 'withdraw') {
    setError('');
    try {
      await save();
      await api(`/api/scenes/${scene.id}/action`, { body: { action } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function start() {
    setError('');
    try {
      await save();
      const drafts = planToTasks(pod.menu, plan);
      const tasks = await Promise.all(drafts.map(async (t, ord) => {
        const id = crypto.randomUUID();
        return { id, ord, bodyEnc: await pod.seal(t, `task:${id}`), minutes: t.minutes ?? null };
      }));
      await api(`/api/scenes/${scene.id}/action`, { body: { action: 'start', tasks, planEnc: await pod.seal(plan, `plan:${scene.id}`), checkinMinutes: plan.checkinMinutes } });
      setConfirmStart(false);
      await reload();
    } catch (err) {
      setError((err as Error).message);
      setConfirmStart(false);
    }
  }

  const check = pacingCheck(pod.menu, plan);
  const pace = pacingOf(pod.menu, plan);
  const tasks = planToTasks(pod.menu, plan);
  const canPropose = sceneTransition(scene.status, 'propose', role);
  const canWithdraw = sceneTransition(scene.status, 'withdraw', role);
  const canStart = sceneTransition(scene.status, 'start', role);

  return (
    <div className="space-y-5">
      {scene.status === 'proposed' && (
        <div className="card border-follow/40 bg-follow-light text-sm">
          {role === 'lead' ? `${pod.nameOf(scene.created_by)} sent you this scene. Change anything you like, then start it.` : `Sent to ${pod.title('lead')}. ${pod.title('lead')} can adjust it and start it.`}
        </div>
      )}

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="plan-title">Scene name</label>
          <input id="plan-title" className="input" value={plan.title} disabled={!editable} placeholder="e.g. Friday night" maxLength={80} onChange={(e) => edit((p) => { p.title = e.target.value; })} />
        </div>
        <div>
          <span className="label">How long?</span>
          <div className="flex flex-wrap gap-2">
            {pod.menu.pacing.map((p) => (
              <button key={p.id} type="button" className="chip" aria-pressed={plan.pacing === p.id} disabled={!editable}
                onClick={() => edit((x) => {
                  x.pacing = p.id;
                  const filled = x.rooms.filter((r) => r.room);
                  x.rooms = [...filled, ...Array.from({ length: Math.max(0, p.rooms - filled.length) }, () => ({ room: '', note: '' }))];
                })}>
                {p.label}
              </button>
            ))}
          </div>
          {pace?.note && <p className="mt-2 text-sm text-ink-soft">{pace.note}</p>}
          {check && (
            <p className="mt-1 flex flex-wrap gap-2 text-xs">
              <Count label="Rooms" v={check.rooms} />
              <Count label="Play breaks" v={check.play} />
              <Count label="Praise tasks" v={check.praise} />
              {check.errands && <span className="rounded-full bg-paper-sunk px-2 py-0.5">Errands welcome</span>}
            </p>
          )}
        </div>
      </div>

      {BUILD_KINDS.map((kind) => <SectionPicker key={kind} kind={kind} plan={plan} edit={edit} editable={editable} />)}

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="plan-checkin">Check-ins while it runs</label>
          <select id="plan-checkin" className="input" disabled={!editable} value={plan.checkinMinutes ?? ''} onChange={(e) => edit((p) => { p.checkinMinutes = e.target.value ? Number(e.target.value) : null; })}>
            <option value="">No check-ins</option>
            {CHECKIN_CHOICES.map((m) => <option key={m} value={m}>Every {m} minutes</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="plan-note">Anything else</label>
          <textarea id="plan-note" className="input" rows={3} disabled={!editable} value={plan.note} maxLength={2000} onChange={(e) => edit((p) => { p.note = e.target.value; })} />
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper-raised/95 p-3 shadow-lg backdrop-blur">
        <span className="text-sm text-ink-soft" role="status">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'error' ? 'Not saved' : editable ? 'Changes save themselves' : 'View only'}
        </span>
        <span className="flex gap-2">
          {canWithdraw && <button type="button" className="btn-quiet" onClick={() => act('withdraw')}>Take it back</button>}
          {canPropose && <button type="button" className="btn-follow" disabled={!tasks.length} onClick={() => act('propose')}>Send to {pod.title('lead')}</button>}
          {canStart && <button type="button" className="btn" disabled={!tasks.length} onClick={() => setConfirmStart(true)}>Start the scene</button>}
        </span>
      </div>

      <Sheet open={confirmStart} onClose={() => setConfirmStart(false)} title="Start the scene?">
        <div className="space-y-4">
          <p>{pod.title('follow')} gets these {tasks.length} tasks{plan.checkinMinutes ? `, with a check-in every ${plan.checkinMinutes} minutes` : ''}:</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {tasks.map((t, i) => <li key={i}>{t.title}</li>)}
          </ol>
          <button type="button" className="btn w-full" onClick={start}>Start now</button>
        </div>
      </Sheet>
    </div>
  );
}

function Count({ label, v: [have, want] }: { label: string; v: [number, number] }) {
  const ok = have >= want;
  return <span className={`rounded-full px-2 py-0.5 ${ok ? 'bg-lead-light text-lead-dark' : 'bg-warn-light text-warn'}`}>{label} {have}/{want}</span>;
}

function SectionPicker({ kind, plan, edit, editable }: { kind: SectionKind; plan: Plan; edit: (fn: (p: Plan) => void) => void; editable: boolean }) {
  const pod = usePod();
  const sec = section(pod.menu, kind);
  const n = picked(pod.menu, plan, kind).length + (kind === 'domain' ? plan.rooms.filter((r) => r.room).length : 0);
  const hasItems = sec.groups.some((g) => g.items.length);
  const [open, setOpen] = useState(n > 0);
  if (!hasItems && kind !== 'domain' && kind !== 'tasks') return null;
  return (
    <section className="card p-0">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="font-display text-lg text-lead-dark">{sec.title}</span>
        <span className="text-sm text-ink-soft">{n ? `${n} picked` : ''} {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          {kind === 'domain' && <Rooms plan={plan} edit={edit} editable={editable} />}
          {sec.groups.map((g) => (
            <div key={g.id} className="space-y-2">
              <p className="eyebrow text-follow">{g.title}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((it) => <Pick key={it.id} item={it} plan={plan} edit={edit} editable={editable} />)}
              </div>
            </div>
          ))}
          {kind === 'tasks' && <TaskExtras plan={plan} edit={edit} editable={editable} />}
        </div>
      )}
    </section>
  );
}

function Pick({ item, plan, edit, editable }: { item: MenuItem; plan: Plan; edit: (fn: (p: Plan) => void) => void; editable: boolean }) {
  const on = Boolean(plan.picks[item.id]);
  return (
    <span className={`inline-flex flex-col ${on && item.param ? 'gap-1' : ''}`}>
      <button type="button" className="chip flex-col items-start gap-0.5" aria-pressed={on} disabled={!editable} title={item.detail}
        onClick={() => edit((p) => { if (on) delete p.picks[item.id]; else p.picks[item.id] = {}; })}>
        <span>{on ? '✓ ' : ''}{withParam(item.label, plan.picks[item.id]?.param, item.param)}</span>
        {item.needs && <span className="text-xs font-normal text-ink-soft">{item.needs.map(proofText).join(' · ')}</span>}
      </button>
      {on && item.param && (
        <input className="input py-1.5 text-sm" placeholder={item.param} aria-label={`${item.label}: ${item.param}`} disabled={!editable} value={plan.picks[item.id]?.param ?? ''} maxLength={40}
          onChange={(e) => edit((p) => { p.picks[item.id] = e.target.value ? { param: e.target.value } : {}; })} />
      )}
    </span>
  );
}

function Rooms({ plan, edit, editable }: { plan: Plan; edit: (fn: (p: Plan) => void) => void; editable: boolean }) {
  const pod = usePod();
  return (
    <div className="space-y-3">
      {plan.rooms.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-xl bg-paper-sunk p-3 sm:grid-cols-[12rem_1fr]">
          <select className="input" aria-label={`Room ${i + 1}`} disabled={!editable} value={r.room} onChange={(e) => edit((p) => { p.rooms[i]!.room = e.target.value; })}>
            <option value="">Room {i + 1}…</option>
            {pod.menu.rooms.map((x) => <option key={x}>{x}</option>)}
            {r.room && !pod.menu.rooms.includes(r.room) && <option>{r.room}</option>}
          </select>
          <input className="input" placeholder="Notes for this room" aria-label={`Notes for room ${i + 1}`} disabled={!editable} value={r.note} maxLength={600} onChange={(e) => edit((p) => { p.rooms[i]!.note = e.target.value; })} />
        </div>
      ))}
      {editable && (
        <button type="button" className="btn-quiet text-sm" onClick={() => edit((p) => { p.rooms.push({ room: '', note: '' }); })}>+ Another room</button>
      )}
      <textarea className="input" rows={2} placeholder="General cleaning notes (standards, products…)" aria-label="General cleaning notes" disabled={!editable} value={plan.roomNotes} maxLength={1000} onChange={(e) => edit((p) => { p.roomNotes = e.target.value; })} />
    </div>
  );
}

function TaskExtras({ plan, edit, editable }: { plan: Plan; edit: (fn: (p: Plan) => void) => void; editable: boolean }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl bg-paper-sunk p-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" disabled={!editable} checked={plan.story.on} onChange={(e) => edit((p) => { p.story.on = e.target.checked; })} /> Short story assignment
        </label>
        {plan.story.on && (
          <div className="grid gap-2">
            <input className="input" placeholder="Players" aria-label="Players" disabled={!editable} value={plan.story.players} onChange={(e) => edit((p) => { p.story.players = e.target.value; })} />
            <input className="input" placeholder="Setting / location" aria-label="Setting" disabled={!editable} value={plan.story.setting} onChange={(e) => edit((p) => { p.story.setting = e.target.value; })} />
            <input className="input" placeholder="Story arc & tags" aria-label="Story arc" disabled={!editable} value={plan.story.arc} onChange={(e) => edit((p) => { p.story.arc = e.target.value; })} />
            <textarea className="input" rows={2} placeholder="Director’s note: actions or lines to include" aria-label="Director’s note" disabled={!editable} value={plan.story.note} onChange={(e) => edit((p) => { p.story.note = e.target.value; })} />
          </div>
        )}
      </div>
      <input className="input" placeholder="Custom writing prompt" aria-label="Custom writing prompt" disabled={!editable} value={plan.customPrompt} maxLength={600} onChange={(e) => edit((p) => { p.customPrompt = e.target.value; })} />
      <div className="grid gap-2 rounded-xl bg-paper-sunk p-3">
        <input className="input" placeholder="Custom task" aria-label="Custom task" disabled={!editable} value={plan.customTask.title} maxLength={120} onChange={(e) => edit((p) => { p.customTask.title = e.target.value; })} />
        {plan.customTask.title && (
          <>
            <textarea className="input" rows={2} placeholder="Details / instructions" aria-label="Custom task details" disabled={!editable} value={plan.customTask.details} onChange={(e) => edit((p) => { p.customTask.details = e.target.value; })} />
            <span className="label mb-0">Proof to send</span>
            <ProofEditor value={plan.customTask.needs} disabled={!editable} onChange={(needs) => edit((p) => { p.customTask.needs = needs; })} />
          </>
        )}
      </div>
    </div>
  );
}
