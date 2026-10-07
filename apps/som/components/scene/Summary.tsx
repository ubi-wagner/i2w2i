'use client';

import { BLOCK_NAME } from '@/lib/blocks';
import { putTitles } from '@/lib/client/ideas';
import { proofText } from '@/lib/menu';
import { arrivalChecklist, planCheckins, planToTasks, type Plan, type TaskDraft } from '@/lib/plan';
import { usePod } from '../Pod';
import { blockTime, timedBlocks, windowMinutes } from './Day';
import { Checklist, KIND_ICON, useLocalTicks } from './parts';
import type { SceneData } from './useScene';

/** "2 hours", for the header. */
function length(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? (h ? `${h} h ${m} min` : `${m} min`) : `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/**
 * Get ready beforehand: what the lead asks the follow to buy, find or have
 * ready. The follow can tick things off on their phone.
 */
export function AheadList({ data, plan = data.plan }: { data: SceneData; plan?: Plan }) {
  const pod = usePod();
  const [ticks, toggle] = useLocalTicks(`ahead:${data.scene.id}`);
  if (!plan.ahead.length) return null;
  const follow = data.role === 'follow';
  return (
    <section className="space-y-2 rounded-xl border border-warn/40 bg-warn-light p-3" aria-label="Get ready beforehand">
      <p className="font-medium">🛒 Get ready beforehand</p>
      <p className="text-sm text-ink-soft">{follow ? `${pod.title('lead')} wants these ready for the day.` : `${pod.title('follow')} gets these ready for the day.`}</p>
      {follow ? <Checklist items={plan.ahead} ticks={ticks} toggle={toggle} /> : <ul className="list-disc space-y-0.5 pl-5 text-sm">{plan.ahead.map((a) => <li key={a}>{a}</li>)}</ul>}
    </section>
  );
}

function TaskLine({ t }: { t: TaskDraft }) {
  const proof = t.needs.map(proofText).join(' · ');
  return (
    <li className="py-1.5">
      <p className="text-sm font-medium"><span aria-hidden>{KIND_ICON[t.kind]} </span>{t.title}{t.minutes ? <span className="font-normal text-ink-soft"> · {t.minutes} min</span> : null}</p>
      {t.checklist.length > 0 && <p className="text-xs text-ink-soft">{t.checklist.join(' · ')}</p>}
      {proof && <p className="text-xs text-ink-soft">Proof: {proof}</p>}
      {t.details && <p className="whitespace-pre-wrap text-xs">{t.details}</p>}
    </li>
  );
}

/**
 * The whole scene on one sheet, as staged: when, what to get ready, what to
 * wear, every block with its tasks and proof, the arrival routine and
 * check-ins. The lead sees it while building and offering; the follow sees
 * it before saying yes, so both know what's expected.
 */
export function SceneSummary({ data, plan = data.plan, showRoleplay = false, showNote = true }: { data: SceneData; plan?: Plan; showRoleplay?: boolean; showNote?: boolean }) {
  const pod = usePod();
  const { scene } = data;
  const tasks = planToTasks(pod.menu, plan);
  const timed = timedBlocks(plan, scene);
  const wear = tasks.filter((t) => t.kind === 'presentation' || t.kind === 'changeover');
  const arrival = arrivalChecklist(pod.menu, plan);
  const checkins = planCheckins(plan, windowMinutes(scene));
  const rest = tasks.filter((t) => typeof t.block !== 'number' || t.block >= plan.blocks.length);
  const total = timed.length ? timed[timed.length - 1]!.end : 0;
  return (
    <section className="card space-y-4" aria-label="The whole scene">
      <div>
        <p className="eyebrow text-follow">The whole scene</p>
        <p className="font-display text-xl text-lead-dark">{plan.title || 'This scene'}</p>
        <p className="text-sm text-ink-soft">
          {[total && tasks.length ? length(total) : '', `${pod.title('lead')} leads`, tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}` : ''].filter(Boolean).join(' · ')}
        </p>
      </div>

      <AheadList data={data} plan={plan} />

      {showRoleplay && plan.roleplay && (
        <div className="space-y-1">
          <p className="font-medium">🎭 {plan.roleplay.title}</p>
          {plan.roleplay.attire && <p className="whitespace-pre-wrap text-sm"><span className="text-ink-soft">Wear:</span> {putTitles(plan.roleplay.attire, pod.menu.titles)}</p>}
          {plan.roleplay.setup && <p className="whitespace-pre-wrap text-sm">{putTitles(plan.roleplay.setup, pod.menu.titles)}</p>}
        </div>
      )}

      {wear.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">👗 What to wear</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {wear.map((t, i) => <li key={i}>{t.checklist.length ? `${t.title}: ${t.checklist.join(', ')}` : t.title}</li>)}
          </ul>
        </div>
      )}

      {!tasks.length && !plan.roleplay && (
        <p className="text-sm text-ink-soft">Not built yet: {pod.title('lead')} builds it once it’s agreed, and {pod.title('follow')} sees all of it before it starts.</p>
      )}

      {tasks.length > 0 && (
        <div className="space-y-3">
          {timed.map((t, i) => {
            const these = tasks.filter((x) => x.block === i);
            if (!these.length && t.kind !== 'free' && t.kind !== 'welcome') return null;
            return (
              <div key={i} className="space-y-0.5" role="group" aria-label={`Block ${i + 1}. ${BLOCK_NAME[t.kind]}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-line pb-1">
                  <span className="eyebrow text-follow">{i + 1}. {BLOCK_NAME[t.kind]}</span>
                  <span className="text-xs tabular-nums text-ink-soft">{blockTime(t, scene.starts_at)}</span>
                </p>
                {t.kind === 'free' && !these.length && <p className="text-sm text-ink-soft">Free time, on call.</p>}
                {t.kind === 'welcome' && <p className="text-sm text-ink-soft">{pod.title('lead')} comes home.</p>}
                <ul className="divide-y divide-line">{these.map((x, j) => <TaskLine key={j} t={x} />)}</ul>
              </div>
            );
          })}
          {rest.length > 0 && <ul className="divide-y divide-line">{rest.map((x, j) => <TaskLine key={j} t={x} />)}</ul>}
        </div>
      )}

      {arrival.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">🚪 When {pod.title('lead')} arrives</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">{arrival.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      {tasks.length > 0 && (
        <p className="text-sm"><span className="text-ink-soft">Check-ins:</span> {checkins.every ? `every ${checkins.every} minutes` : checkins.at.length ? 'at the end of each block' : 'none'}. {pod.title('lead')} can ask for a photo or a quick act any time.</p>
      )}
      {showNote && plan.note && <p className="whitespace-pre-wrap text-sm">“{plan.note}”</p>}
    </section>
  );
}
