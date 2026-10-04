'use client';

import { useEffect, useState } from 'react';
import { blockAt, BLOCK_NAME, schedule, type Timed } from '@/lib/blocks';
import { arrivalChecklist, type Plan } from '@/lib/plan';
import { usePod } from '../Pod';
import { clock } from '../ui';
import type { SceneRow, TaskView } from './useScene';

const MIN = 60_000;

/** "2 hours", "1 h 45 min", "45 min". */
export function span(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!m) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** "10:30 AM – 12:30 PM" from a start time, or how long it is without one. */
export function blockTime(t: Timed, base: string | Date | null): string {
  if (!base) return span(t.end - t.start);
  const b = new Date(base).getTime();
  return `${clock(new Date(b + t.start * MIN))} – ${clock(new Date(b + t.end * MIN))}`;
}

/** The planned length of a scene in minutes, from its window (if it has one). */
export function windowMinutes(scene: Pick<SceneRow, 'starts_at' | 'ends_at'>): number | undefined {
  return scene.starts_at && scene.ends_at ? Math.round((new Date(scene.ends_at).getTime() - new Date(scene.starts_at).getTime()) / MIN) : undefined;
}

/** The plan's blocks with their times (and any free stretch at the end). */
export function timedBlocks(plan: Plan, scene: Pick<SceneRow, 'starts_at' | 'ends_at'>): Timed[] {
  return schedule(plan.blocks.map((b) => b.kind), windowMinutes(scene));
}

function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/**
 * The tasks, block by block, with each block's times: from the planned start
 * (sent) or the real one (running, with the block that's on now marked).
 * Tasks with no block (a demand, an older scene) come after.
 */
export function DayList({ plan, scene, tasks, base, skew = 0, row }: {
  plan: Plan;
  scene: SceneRow;
  tasks: TaskView[];
  /** When the day started (or starts), for clock times. */
  base: string | null;
  skew?: number;
  row: (t: TaskView) => React.ReactNode;
}) {
  const pod = usePod();
  const now = useNow();
  const timed = timedBlocks(plan, scene);
  const inBlock = (t: TaskView) => typeof t.body.block === 'number' && t.body.block < plan.blocks.length;
  const rest = tasks.filter((t) => !inBlock(t));
  if (!tasks.some(inBlock)) {
    return <ul className="divide-y divide-line">{tasks.map((t) => <li key={t.id}>{row(t)}</li>)}</ul>;
  }
  const on = scene.status === 'active' && base && !scene.paused_at ? blockAt(timed, (now + skew - new Date(base).getTime()) / MIN) : -1;
  const arrival = arrivalChecklist(pod.menu, plan);
  return (
    <div className="space-y-4">
      {timed.map((t, i) => {
        const these = tasks.filter((x) => x.body.block === i);
        const head = `${i + 1}. ${BLOCK_NAME[t.kind]}`;
        return (
          <section key={i} aria-label={`Block ${head}`} className={`space-y-1 rounded-xl ${on === i ? 'bg-follow-light px-2 py-1 ring-1 ring-follow/50' : ''}`}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-line pb-1">
              <span className="eyebrow text-follow">{head}{on === i ? ' · now' : ''}</span>
              <span className="text-xs tabular-nums text-ink-soft">{blockTime(t, base)}</span>
            </p>
            {t.kind === 'free' && <p className="text-sm text-ink-soft">Free time, on call: {pod.title('lead')} may send a demand.</p>}
            {t.kind === 'welcome' && (
              <div className="text-sm text-ink-soft">
                <p>{pod.title('lead')} comes home{arrival.length ? ': the arrival routine' : ''}.</p>
                {arrival.length > 0 && <ul className="list-disc pl-5">{arrival.map((a) => <li key={a}>{a}</li>)}</ul>}
              </div>
            )}
            {these.length > 0 && <ul className="divide-y divide-line">{these.map((x) => <li key={x.id}>{row(x)}</li>)}</ul>}
          </section>
        );
      })}
      {rest.length > 0 && (
        <section aria-label="Other tasks" className="space-y-1">
          <p className="eyebrow border-b border-line pb-1 text-follow">Also</p>
          <ul className="divide-y divide-line">{rest.map((x) => <li key={x.id}>{row(x)}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
