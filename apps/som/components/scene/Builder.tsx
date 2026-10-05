'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { blocksForWindow, BLOCK_NAME, isWork, slotLabel, slotsFor, type BlockKind, type SlotSpec } from '@/lib/blocks';
import { newId, proofText, section, type MenuItem, type Proof } from '@/lib/menu';
import { arrivalChecklist, autoFill, blocksFor, cleanPlan, CHECKIN_CHOICES, pacingFor, pacingOf, picked, placeLoose, planCheckins, planItems, planToTasks, recentlyUsed, tidyPlan, withParam, type Plan, type PlanItem } from '@/lib/plan';
import { sceneTransition } from '@/lib/rules';
import { usePod } from '../Pod';
import { ProofEditor } from '../ProofEditor';
import { ErrorText, Sheet } from '../ui';
import { CapacityLine, hoursOf, lengthText, OfferForm, useReply, when } from './Offer';
import { RoleplayCard } from './Roleplay';
import { LimitsNote } from '../Profiles';
import { recentPlans, useScenes } from '../scenes';
import { blockTime, timedBlocks, windowMinutes } from './Day';
import { SceneSummary } from './Summary';
import { KIND_ICON } from './parts';
import type { SceneData } from './useScene';

type Edit = (fn: (p: Plan) => void) => void;

/** New blocks for a length of day, keeping what's in any block that stays the same kind. */
function reshape(p: Plan, kinds: BlockKind[]) {
  p.blocks = kinds.map((kind, i) => ({ kind, items: p.blocks[i]?.kind === kind ? p.blocks[i]!.items : [] }));
}

const placedAny = (p: Plan) => p.blocks.some((b) => b.items.length);

/** A staged day's hours, from 8:30 for as long as its blocks run (an offer starts from these). */
function dayHours(timed: { end: number }[]): { from: string; until: string } {
  const mins = Math.min(Math.max(timed.length ? timed[timed.length - 1]!.end : 120, 15), 15 * 60);
  const end = 8 * 60 + 30 + mins;
  const hh = (n: number) => String(n).padStart(2, '0');
  return { from: '08:30', until: `${hh(Math.floor(end / 60) % 24)}:${hh(end % 60)}` };
}

/** Drafting a scene, block by block: tap to pick from the menu. Saves as you go. */
export function Builder({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene, role } = data;
  const editable = Boolean(sceneTransition(scene.status, 'edit', role)) && !data.planBroken;
  const [stored, setPlan] = useState<Plan>(data.plan);
  // A plan from before blocks, seen by someone who can't edit it: shown in blocks.
  const plan = stored.blocks.length || editable ? stored : placeLoose(pod.menu, { ...stored, blocks: blocksFor(pacingOf(pod.menu, stored)?.hours ?? 2) });
  const [rev, setRev] = useState(scene.plan_rev);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [confirming, setConfirm] = useState<'start' | 'send' | null>(null);
  const [offering, setOffering] = useState(false);
  const [picking, setPicking] = useState<{ block: number; slot: SlotSpec } | null>(null);
  const [whole, setWhole] = useState(false);
  // The beforehand list as typed (blank lines and all); the plan keeps the lines.
  const [aheadText, setAheadText] = useState(data.plan.ahead.join('\n'));
  // Edits are numbered; a save covers the edits made before it began. One
  // save at a time, so a quick second edit never races the first.
  const planRef = useRef(stored);
  planRef.current = stored;
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

  // A failed save stays unsaved and is tried again; true once everything is saved.
  const [retry, setRetry] = useState(0);
  const save = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    if (!dirty() || !editable) return true;
    const upTo = edits.current;
    let ok = false;
    const run = (async () => {
      setSaving('saving');
      try {
        const r = await api<{ rev: number }>(`/api/scenes/${scene.id}/plan`, { method: 'PUT', body: { planEnc: await pod.seal(planRef.current, `plan:${scene.id}`), rev: revRef.current } });
        savedUpTo.current = upTo;
        revRef.current = r.rev;
        setRev(r.rev);
        setSaving(dirty() ? 'idle' : 'saved');
        setError('');
        ok = !dirty();
      } catch (err) {
        setSaving('error');
        if (err instanceof ApiError && err.status === 409) {
          savedUpTo.current = edits.current;
          setError('Your partner changed this at the same time; showing their version.');
          inFlight.current = null;
          await reload();
        } else {
          setError(`Not saved: ${(err as Error).message} Trying again…`);
          setTimeout(() => setRetry((n) => n + 1), 4000);
        }
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
    return ok;
  }, [editable, pod, scene.id, reload]);

  useEffect(() => {
    if (!dirty()) return;
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
  }, [plan, save, retry]);

  // Leaving the page or the app: save now rather than lose the last tap.
  useEffect(() => {
    const flush = () => { if (dirty()) void save(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [save]);

  const edit: Edit = (fn) => {
    if (!editable) return;
    setPlan((p) => {
      const c = structuredClone(p);
      fn(c);
      delete c.arrival; // a draft's routine follows the menu until it's started or sent
      return tidyPlan(pod.menu, cleanPlan(c));
    });
    edits.current += 1;
    setSaving('idle');
    setError('');
  };

  const aheadJoined = stored.ahead.join('\n');
  useEffect(() => {
    if (document.activeElement?.id !== 'plan-ahead') setAheadText(aheadJoined);
  }, [aheadJoined]);

  // Novelty: Fill it for me steers away from what the last few scenes used.
  const { scenes: listed } = useScenes();
  const avoid = useMemo(() => recentlyUsed(listed ? recentPlans(listed, scene.id) : []), [listed, scene.id]);

  // The day fits the agreed window and how much the follow can take on (until
  // anything is picked; then it's the lead's call). A plan from before blocks
  // gets them too.
  const reply = useReply(scene);
  const windowHours = scene.starts_at ? hoursOf(scene.starts_at, scene.ends_at) : null;
  const fitted = windowHours ? blocksForWindow(windowHours, reply?.capacity ?? null) : null;
  const fitKey = fitted?.join(',') ?? '';
  useEffect(() => {
    const p = planRef.current;
    const want = fitted && scene.status === 'accepted' && !placedAny(p) ? fitted : !p.blocks.length ? blocksFor(pacingOf(pod.menu, p)?.hours ?? 2).map((b) => b.kind) : null;
    // Picks from before blocks go into the new blocks rather than being lost.
    if (want && want.join(',') !== p.blocks.map((b) => b.kind).join(',')) edit((x) => { reshape(x, want); Object.assign(x, placeLoose(pod.menu, x)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, scene.status]);

  async function act(action: 'propose' | 'withdraw' | 'cancel') {
    if (action === 'cancel' && !confirm(`Call it off this time? ${follow} will be told, and it goes back to a draft.`)) return;
    if (action === 'withdraw' && role === 'lead' && !confirm(`Not now? ${pod.nameOf(scene.created_by)} will be told, and it goes back to their drafts.`)) return;
    setError('');
    try {
      if (!(await save())) return;
      await api(`/api/scenes/${scene.id}/action`, { body: { action } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /** Start now, or send it for the follow to start: the phone turns the plan into encrypted tasks. */
  async function go(action: 'start' | 'send') {
    setError('');
    try {
      await save();
      const drafts = planToTasks(pod.menu, plan);
      const tasks = await Promise.all(drafts.map(async (t, ord) => {
        const id = crypto.randomUUID();
        return { id, ord, bodyEnc: await pod.seal(t, `task:${id}`), minutes: t.minutes ?? null };
      }));
      const checkins = planCheckins(plan, windowMinutes(scene));
      // The arrival routine is kept with the scene as it is now, so a later menu change can't alter it.
      const kept = { ...plan, arrival: arrivalChecklist(pod.menu, { ...plan, arrival: undefined }) };
      await api(`/api/scenes/${scene.id}/action`, { body: { action, tasks, planEnc: await pod.seal(kept, `plan:${scene.id}`), checkinMinutes: checkins.every, checkinAt: checkins.at } });
      setConfirm(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
      setConfirm(null);
    }
  }

  const lead = pod.title('lead');
  const follow = pod.title('follow');
  const pace = pacingOf(pod.menu, plan);
  const tasks = planToTasks(pod.menu, plan);
  const timed = timedBlocks(plan, scene);
  const items = useMemo(() => planItems(pod.menu, plan), [pod.menu, plan]);
  const short = plan.blocks.flatMap((b, i) => slotsFor(b.kind, timed[i]?.first ?? false)
    .filter((s) => b.items.filter((id) => items.get(id)?.kind === s.kind).length < s.min)
    .map((s) => `${i + 1}. ${slotLabel(s, lead).replace(/ \(.*\)$/, '')}`));
  const canPropose = sceneTransition(scene.status, 'propose', role);
  const canWithdraw = sceneTransition(scene.status, 'withdraw', role);
  const canStart = sceneTransition(scene.status, 'start', role);
  const canSend = sceneTransition(scene.status, 'send', role);
  const canOffer = (scene.status === 'draft' || scene.status === 'accepted' || scene.status === 'proposed') && sceneTransition(scene.status, 'offer', role, scene.offered_by === pod.account.id);
  const canCallOff = scene.status === 'accepted';
  // A roleplay can go with no tasks at all.
  const sendable = (tasks.length > 0 || Boolean(plan.roleplay)) && !data.planBroken;
  const checkins = planCheckins(plan, windowMinutes(scene));
  const checkinText = checkins.every ? `a check-in every ${checkins.every} minutes` : checkins.at.length ? 'a check-in at the end of each block' : '';

  return (
    <div className="space-y-5">
      {scene.status === 'accepted' && (
        <div className="card space-y-1 border-lead/40 bg-lead-light">
          <p className="eyebrow text-lead">Agreed with {follow}</p>
          <p className="font-display text-xl text-lead-dark">{when(scene.starts_at, scene.ends_at)}</p>
          <p className="text-sm text-lead-dark">{lengthText(scene.starts_at, scene.ends_at)}</p>
          {reply && <CapacityLine reply={reply} />}
          {reply?.note && <p className="whitespace-pre-wrap text-sm">“{reply.note}”</p>}
          <p className="pt-1 text-sm">Pick what goes in each block (or let it fill itself in), then send it. {follow} starts it.</p>
        </div>
      )}
      {plan.roleplay && <RoleplayCard rp={plan.roleplay} />}
      {role === 'lead' && <LimitsNote accountId={data.members.find((m) => m.role === 'follow')?.account_id} name={follow} />}
      {scene.status === 'proposed' && (
        <div className="card border-follow/40 bg-follow-light text-sm">
          {role === 'lead' ? `${pod.nameOf(scene.created_by)} sent you this scene. Change anything you like, then start it.` : `Sent to ${lead}. ${lead} can adjust it and start it.`}
        </div>
      )}

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="plan-title">Scene name</label>
          <input id="plan-title" className="input" value={plan.title} disabled={!editable} placeholder="e.g. Friday night" maxLength={80} onChange={(e) => edit((p) => { p.title = e.target.value; })} />
        </div>
        {!scene.starts_at && (
          <div>
            <span className="label">How long?</span>
            <div className="flex flex-wrap gap-2">
              {pod.menu.pacing.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={plan.pacing === p.id} disabled={!editable}
                  onClick={() => edit((x) => { x.pacing = p.id; reshape(x, blocksFor(p.hours).map((b) => b.kind)); })}>
                  {p.label}
                </button>
              ))}
            </div>
            {pace?.note && <p className="mt-2 text-sm text-ink-soft">{pace.note}</p>}
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Two-hour blocks: getting ready (or a 15-minute change-over), two chores at home or errands out, then devotion and one for {lead}, 15 minutes each.
          {plan.blocks.some((b) => b.kind === 'free') ? ' A long day has a free hour, on call, and ends with welcome home.' : ''}
        </p>
        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-follow flex-1" onClick={() => edit((p) => { Object.assign(p, autoFill(pod.menu, p, Math.random, windowHours ?? undefined, avoid)); })}>✨ Fill it for me</button>
            {tasks.length > 0 && (
              <button type="button" className="text-sm text-ink-soft underline"
                onClick={() => { if (confirm('Clear every pick and start again?')) edit((p) => { p.picks = {}; p.customs = []; p.blocks.forEach((b) => { b.items = []; }); }); }}>
                Clear picks
              </button>
            )}
          </div>
        )}
        {editable && avoid.size > 0 && <p className="text-xs text-ink-soft">New first: it skips what your last few scenes used, while there’s something else.</p>}
        <button type="button" className="btn-quiet w-full" onClick={() => setWhole(true)}>See the whole scene</button>
      </div>

      {plan.blocks.map((b, i) => (
        <BlockCard key={i} i={i} plan={plan} items={items} first={timed[i]?.first ?? false} time={timed[i] ? blockTime(timed[i]!, scene.starts_at) : ''}
          edit={edit} editable={editable} onPick={(slot) => setPicking({ block: i, slot })} />
      ))}
      {timed.length > plan.blocks.length && (
        <section className="card flex items-baseline justify-between gap-2 py-3" aria-label="Free time at the end">
          <span className="font-display text-lg text-lead-dark">{plan.blocks.length + 1}. Free time</span>
          <span className="text-sm tabular-nums text-ink-soft">{blockTime(timed[timed.length - 1]!, scene.starts_at)}</span>
        </section>
      )}

      <Arrival plan={plan} edit={edit} editable={editable} />

      <section className="card space-y-2">
        <label className="label mb-0" htmlFor="plan-ahead">🛒 For {follow} to get ready beforehand</label>
        <p className="text-xs text-ink-soft">Equipment, new clothes, anything to buy or find before the day. One per line; {follow} sees it before saying yes.</p>
        <textarea id="plan-ahead" className="input" rows={3} disabled={!editable} value={aheadText} maxLength={4000} placeholder={'A locking collar\nBlack stockings, size M'}
          onChange={(e) => { const v = e.target.value; setAheadText(v); edit((p) => { p.ahead = v.split('\n').map((x) => x.trim()).filter(Boolean); }); }} />
      </section>

      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="plan-checkin">Check-ins while it runs</label>
          <select id="plan-checkin" className="input" disabled={!editable} value={plan.checkinMinutes === null ? 'blocks' : String(plan.checkinMinutes)}
            onChange={(e) => edit((p) => { p.checkinMinutes = e.target.value === 'blocks' ? null : Number(e.target.value); })}>
            <option value="blocks">At the end of each block</option>
            {CHECKIN_CHOICES.map((m) => <option key={m} value={m}>Every {m} minutes</option>)}
            <option value="0">No check-ins</option>
          </select>
          <p className="mt-1 text-xs text-ink-soft">{lead} can ask for a photo or a quick act, with proof, any time it runs: a demand.</p>
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
          {canWithdraw && <button type="button" className="btn-quiet" onClick={() => act('withdraw')}>{role === 'lead' ? 'Not now' : 'Take it back'}</button>}
          {canCallOff && <button type="button" className="btn-quiet" onClick={() => act('cancel')}>Call it off</button>}
          {canPropose && <button type="button" className="btn-follow" disabled={!sendable} onClick={() => act('propose')}>Send to {lead}</button>}
          {canOffer && <button type="button" className="btn-quiet" onClick={() => setOffering(true)}>{scene.status === 'accepted' ? 'Change the time' : 'Offer a time'}</button>}
          {canStart && <button type="button" className="btn" disabled={!sendable} onClick={() => setConfirm('start')}>Start now</button>}
          {canSend && <button type="button" className="btn" disabled={!sendable} onClick={() => setConfirm('send')}>Send to {follow}</button>}
        </span>
      </div>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title={picking ? `${picking.block + 1}. ${BLOCK_NAME[plan.blocks[picking.block]?.kind ?? 'home']}: ${slotLabel(picking.slot, lead).replace(/ \(.*\)$/, '')}` : ''}>
        {picking && <Picker plan={plan} items={items} block={picking.block} slot={picking.slot} edit={edit} onDone={() => setPicking(null)} />}
      </Sheet>

      <Sheet open={confirming !== null} onClose={() => setConfirm(null)} title={confirming === 'send' ? `Send to ${follow}?` : 'Start the scene?'}>
        <div className="space-y-4">
          <p>
            {plan.roleplay && !tasks.length ? `It’s on: ${plan.roleplay.title}` : `${follow} gets these ${tasks.length} tasks`}{checkinText ? `, with ${checkinText}` : ''}
            {confirming === 'send' && scene.starts_at ? `, to start ${when(scene.starts_at, null)}` : ''}:
          </p>
          {short.length > 0 && <p className="text-sm text-warn">Not filled yet: {short.join(', ')}.</p>}
          {plan.checkinMinutes === null && !checkins.at.length && tasks.length > 0 && <p className="text-sm text-ink-soft">No check-ins: none of the work blocks has anything in it.</p>}
          {plan.blocks.map((b, i) => {
            const these = tasks.filter((t) => t.block === i);
            if (!these.length) return null;
            return (
              <div key={i} className="space-y-1">
                <p className="eyebrow text-follow">{i + 1}. {BLOCK_NAME[b.kind]} · {timed[i] ? blockTime(timed[i]!, scene.starts_at) : ''}</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm">{these.map((t, j) => <li key={j}>{t.title}</li>)}</ol>
              </div>
            );
          })}
          <button type="button" className="btn w-full" onClick={() => go(confirming ?? 'start')}>{confirming === 'send' ? 'Send it' : 'Start now'}</button>
        </div>
      </Sheet>
      <Sheet open={whole} onClose={() => setWhole(false)} title="The whole scene" wide>
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">{scene.status === 'draft' || scene.status === 'proposed' ? `This is what ${role === 'lead' ? follow : lead} sees before saying yes.` : 'As it stands now.'}</p>
          <SceneSummary data={data} plan={plan} showRoleplay />
          {canOffer && <button type="button" className="btn w-full" onClick={() => { setWhole(false); setOffering(true); }}>{scene.status === 'accepted' ? 'Change the time' : 'Offer it'}</button>}
        </div>
      </Sheet>
      <Sheet open={offering} onClose={() => setOffering(false)} title={scene.status === 'accepted' ? 'Change the time' : `Offer it to ${follow}`}>
        {scene.status !== 'accepted' && tasks.length > 0 && <p className="mb-3 text-sm text-ink-soft">{follow} sees the whole scene ({tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}{plan.ahead.length ? `, ${plan.ahead.length} to get ready beforehand` : ''}) before saying yes.</p>}
        <OfferForm
          initial={scene.starts_at ? { startsAt: scene.starts_at, endsAt: scene.ends_at } : { hours: dayHours(timed) }}
          submit={scene.status === 'accepted' ? 'Send the new time' : 'Send the offer'}
          noteLabel={`A note for ${follow} (optional)`}
          onSubmit={async ({ start, end, note }) => {
            await save();
            const hours = hoursOf(start, end);
            const next = cleanPlan({ ...plan, pacing: pacingFor(pod.menu, hours)?.id ?? plan.pacing, blocks: placedAny(plan) ? plan.blocks : blocksFor(hours), note: note || plan.note });
            await api(`/api/scenes/${scene.id}/action`, { body: { action: 'offer', startsAt: start.toISOString(), endsAt: end.toISOString(), planEnc: await pod.seal(next, `plan:${scene.id}`) } });
            setOffering(false);
            await reload();
          }}
        />
      </Sheet>
    </div>
  );
}

/** One block: home or out (for a work block), its times, and what's in each part of it. */
function BlockCard({ i, plan, items, first, time, edit, editable, onPick }: {
  i: number; plan: Plan; items: Map<string, PlanItem>; first: boolean; time: string;
  edit: Edit; editable: boolean; onPick: (slot: SlotSpec) => void;
}) {
  const pod = usePod();
  const lead = pod.title('lead');
  const b = plan.blocks[i]!;
  const slots = slotsFor(b.kind, first);
  // Home ↔ out swaps the chores for errands; getting ready and the praise stay.
  const setKind = (kind: BlockKind) => edit((p) => {
    const keep = new Set(slotsFor(kind, first).map((s) => s.kind));
    p.blocks[i] = { kind, items: p.blocks[i]!.items.filter((id) => keep.has(items.get(id)?.kind ?? 'arrival')) };
  });
  return (
    <section className="card space-y-3" aria-label={`Block ${i + 1}: ${BLOCK_NAME[b.kind]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-display text-lg text-lead-dark">{i + 1}. {BLOCK_NAME[b.kind]}</p>
        <span className="text-sm tabular-nums text-ink-soft">{time}</span>
      </div>
      {isWork(b.kind) && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Block ${i + 1}: where`}>
          {(['home', 'out'] as const).map((k) => (
            <button key={k} type="button" className="chip justify-center" aria-pressed={b.kind === k} disabled={!editable} onClick={() => b.kind !== k && setKind(k)}>
              {k === 'home' ? '🏠 At home' : '🛍️ Out'}
            </button>
          ))}
        </div>
      )}
      {b.kind === 'free' && <p className="text-sm text-ink-soft">Free time, on call: {lead} may send a demand.</p>}
      {b.kind === 'welcome' && <p className="text-sm text-ink-soft">{lead} comes home: the arrival routine (below), and anything to be ready in.</p>}
      {slots.map((s) => <SlotRow key={s.slot} block={i} slot={s} plan={plan} items={items} edit={edit} editable={editable} onPick={() => onPick(s)} />)}
    </section>
  );
}

function SlotRow({ block, slot, plan, items, edit, editable, onPick }: {
  block: number; slot: SlotSpec; plan: Plan; items: Map<string, PlanItem>; edit: Edit; editable: boolean; onPick: () => void;
}) {
  const pod = usePod();
  const lead = pod.title('lead');
  const here = plan.blocks[block]!.items.map((id) => items.get(id)).filter((x): x is PlanItem => x?.kind === slot.kind);
  const label = slotLabel(slot, lead);
  const short = here.length < slot.min;
  return (
    <div className="space-y-1.5 border-t border-line pt-2.5" role="group" aria-label={`Block ${block + 1}: ${label}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{KIND_ICON[slot.kind]} {label}</span>
        {slot.max > 1 && <span className={`text-xs ${short ? 'text-warn' : 'text-ink-soft'}`}>{here.length}/{slot.max}</span>}
      </div>
      {here.length > 0 && (
        <ul className="space-y-1.5">
          {here.map((it) => <Picked key={it.id} item={it} plan={plan} edit={edit} editable={editable} block={block} />)}
        </ul>
      )}
      {editable && here.length < slot.max && (
        <button type="button" className={`btn-quiet min-h-9 w-full py-1 text-sm ${short ? 'border-warn/50' : ''}`} onClick={onPick}>
          + {here.length ? 'Another' : slot.slot === 'chores' ? 'Pick two chores' : 'Pick'}
        </button>
      )}
    </div>
  );
}

/** Something picked: its wording (with the blank filled in), proof, and a way to take it out. */
function Picked({ item, plan, edit, editable, block }: { item: PlanItem; plan: Plan; edit: Edit; editable: boolean; block: number }) {
  const pod = usePod();
  const param = plan.picks[item.id]?.param;
  const title = withParam(item.label, param, item.param);
  const setParam = (v: string) => edit((p) => { p.picks[item.id] = v ? { param: v } : {}; });
  return (
    <li className="space-y-1.5 rounded-xl bg-paper-sunk px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}{item.custom ? ' ✍️' : ''}</span>
          {item.needs?.length ? <span className="block text-xs text-ink-soft">{item.needs.map(proofText).join(' · ')}</span> : null}
        </span>
        {editable && (
          <button type="button" className="shrink-0 rounded-full px-2 text-lg leading-none text-ink-soft" aria-label={`Take out “${title}”`}
            onClick={() => edit((p) => { p.blocks[block]!.items = p.blocks[block]!.items.filter((x) => x !== item.id); delete p.picks[item.id]; })}>×</button>
        )}
      </div>
      {item.param === 'room' ? (
        <select className="input py-1.5" aria-label={`${item.label}: room`} disabled={!editable} value={param ?? ''} onChange={(e) => setParam(e.target.value)}>
          <option value="">Which room?</option>
          {pod.menu.rooms.map((r) => <option key={r}>{r}</option>)}
          {param && !pod.menu.rooms.includes(param) && <option>{param}</option>}
        </select>
      ) : item.param ? (
        <input className="input py-1.5 sm:text-sm" placeholder={item.param} aria-label={`${item.label}: ${item.param}`} disabled={!editable} value={param ?? ''} maxLength={40} onChange={(e) => setParam(e.target.value)} />
      ) : null}
    </li>
  );
}

/** Picking for one part of a block: the menu's section, each thing once a day, or something written for this scene. */
function Picker({ plan, items, block, slot, edit, onDone }: { plan: Plan; items: Map<string, PlanItem>; block: number; slot: SlotSpec; edit: Edit; onDone: () => void }) {
  const pod = usePod();
  const sec = section(pod.menu, slot.kind);
  const mine = plan.blocks[block]!.items.filter((id) => items.get(id)?.kind === slot.kind);
  const full = mine.length >= slot.max;
  const where = (id: string) => plan.blocks.findIndex((b) => b.items.includes(id));
  const [writing, setWriting] = useState(false);
  const toggle = (it: MenuItem) => edit((p) => {
    const b = p.blocks[block]!;
    if (b.items.includes(it.id)) {
      b.items = b.items.filter((x) => x !== it.id);
      delete p.picks[it.id];
    } else {
      b.items.push(it.id);
      p.picks[it.id] = {};
    }
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft" role="status">{mine.length} of {slot.max === slot.min ? slot.max : `up to ${slot.max}`} picked{full ? ': take one out to swap' : ''}.</p>
      {sec.groups.filter((g) => g.items.length).map((g) => (
        <div key={g.id} className="space-y-2">
          <p className="eyebrow text-follow">{g.title}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((it) => {
              const at = where(it.id);
              const on = at === block;
              const elsewhere = at >= 0 && !on;
              return (
                <button key={it.id} type="button" className="chip flex-col items-start gap-0.5 text-left" aria-pressed={on} disabled={elsewhere || (full && !on)} title={it.detail} onClick={() => toggle(it)}>
                  <span>{on ? '✓ ' : ''}{it.label}</span>
                  {(it.needs?.length || elsewhere) && (
                    <span className="text-xs font-normal text-ink-soft">{elsewhere ? `In block ${at + 1}` : it.needs!.map(proofText).join(' · ')}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!sec.groups.some((g) => g.items.length) && <p className="text-sm text-ink-soft">Nothing in “{sec.title.replace('{lead}', pod.title('lead'))}” on the menu yet.</p>}
      {writing ? (
        <OwnItem kind={slot.kind} onAdd={(c) => { edit((p) => { p.customs.push(c); p.blocks[block]!.items.push(c.id); }); setWriting(false); }} onCancel={() => setWriting(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!full && <button type="button" className="btn-quiet" onClick={() => setWriting(true)}>✍️ Write your own</button>}
          <Link href={`/menu#${slot.kind}`} className="text-sm text-lead underline">More ideas…</Link>
        </div>
      )}
      <button type="button" className="btn w-full" onClick={onDone}>Done</button>
    </div>
  );
}

function OwnItem({ kind, onAdd, onCancel }: { kind: SlotSpec['kind']; onAdd: (c: Plan['customs'][number]) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [details, setDetails] = useState('');
  const [needs, setNeeds] = useState<Proof[]>([{ kind: kind === 'tasks' || kind === 'wishes' ? 'text' : 'photo', count: 1 }]);
  return (
    <div className="space-y-2 rounded-xl bg-paper-sunk p-3">
      <input className="input" placeholder="What to do" aria-label="Your own: what to do" value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} />
      <textarea className="input" rows={2} placeholder="Details (optional)" aria-label="Your own: details" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
      <span className="label mb-0">Proof to send</span>
      <ProofEditor value={needs} onChange={setNeeds} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn" disabled={!label.trim()} onClick={() => onAdd({ id: newId(), kind, label: label.trim(), details: details.trim(), needs })}>Add it</button>
      </div>
    </div>
  );
}

/** The arrival routine: for the whole day, shown when the lead's on the way. */
function Arrival({ plan, edit, editable }: { plan: Plan; edit: Edit; editable: boolean }) {
  const pod = usePod();
  const sec = section(pod.menu, 'arrival');
  const n = picked(pod.menu, plan, 'arrival').length;
  const [open, setOpen] = useState(n > 0);
  if (!sec.groups.some((g) => g.items.length) && !editable) return null;
  return (
    <section className="card p-0">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="font-display text-lg text-lead-dark">{KIND_ICON.arrival} {sec.title}</span>
        <span className="text-sm text-ink-soft">{n ? `${n} picked` : ''} {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <p className="text-sm text-ink-soft">Shown when {pod.title('lead')} says they’re on the way.</p>
          {sec.groups.map((g) => (
            <div key={g.id} className="space-y-2">
              <p className="eyebrow text-follow">{g.title}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((it) => {
                  const on = Boolean(plan.picks[it.id]);
                  return (
                    <button key={it.id} type="button" className="chip" aria-pressed={on} disabled={!editable} onClick={() => edit((p) => { if (on) delete p.picks[it.id]; else p.picks[it.id] = {}; })}>
                      {on ? '✓ ' : ''}{it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {editable && <Link href="/menu#arrival" className="block text-sm text-lead underline">More ideas for this section…</Link>}
        </div>
      )}
    </section>
  );
}
